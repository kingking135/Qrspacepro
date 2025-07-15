from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import bcrypt
from jose import JWTError, jwt
import qrcode
from io import BytesIO
import base64
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-here-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Stripe Configuration
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY')
SUBSCRIPTION_PRICE = 9.99  # €9.99/month

# Create the main app
app = FastAPI(title="Space QR Pro API", version="1.0.0")
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# MODELS
# =============================================================================

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    password_hash: str
    is_active: bool = True
    is_admin: bool = False
    subscription_status: str = "inactive"  # inactive, active, canceled
    subscription_session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserRegister(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: Dict[str, Any]

class Restaurant(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    address: str
    phone: str
    logo: Optional[str] = None  # base64 encoded image
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class RestaurantCreate(BaseModel):
    name: str
    address: str
    phone: str
    logo: Optional[str] = None

class Menu(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    restaurant_id: str
    name: str
    qr_code: Optional[str] = None  # base64 encoded QR code
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class MenuCreate(BaseModel):
    restaurant_id: str
    name: str

class Dish(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    menu_id: str
    name: str
    description: str
    price: float
    image: Optional[str] = None  # base64 encoded image
    options: List[str] = []
    is_available: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class DishCreate(BaseModel):
    menu_id: str
    name: str
    description: str
    price: float
    image: Optional[str] = None
    options: List[str] = []

class PaymentTransaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    session_id: str
    amount: float
    currency: str = "eur"
    payment_status: str = "pending"
    metadata: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class SubscriptionRequest(BaseModel):
    host_url: str

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"email": email})
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_active"):
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

async def get_current_subscribed_user(current_user: dict = Depends(get_current_active_user)):
    if current_user.get("subscription_status") != "active":
        raise HTTPException(status_code=403, detail="Active subscription required")
    return current_user

def generate_qr_code(data: str) -> str:
    """Generate QR code and return as base64 encoded string"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"

# =============================================================================
# AUTHENTICATION ENDPOINTS
# =============================================================================

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserRegister):
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    password_hash = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        password_hash=password_hash
    )
    
    await db.users.insert_one(user.dict())
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    user_dict = user.dict()
    user_dict.pop("password_hash")
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_dict
    }

@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    user = await db.users.find_one({"email": user_data.email})
    if not user or not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    
    # Remove MongoDB ObjectId and other non-serializable fields
    user_clean = {k: v for k, v in user.items() if k not in ["_id", "password_hash"]}
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_clean
    }

@api_router.get("/auth/me")
async def get_current_user_info(current_user: dict = Depends(get_current_active_user)):
    user_clean = {k: v for k, v in current_user.items() if k not in ["_id", "password_hash"]}
    return user_clean

# =============================================================================
# SUBSCRIPTION ENDPOINTS
# =============================================================================

@api_router.post("/subscription/create-checkout")
async def create_subscription_checkout(
    request: SubscriptionRequest,
    current_user: dict = Depends(get_current_active_user)
):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    # Initialize Stripe checkout
    webhook_url = f"{request.host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    # Create checkout session
    success_url = f"{request.host_url}/dashboard?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{request.host_url}/subscription"
    
    checkout_request = CheckoutSessionRequest(
        amount=SUBSCRIPTION_PRICE,
        currency="eur",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": current_user["id"],
            "user_email": current_user["email"],
            "subscription_type": "monthly"
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    transaction = PaymentTransaction(
        user_id=current_user["id"],
        session_id=session.session_id,
        amount=SUBSCRIPTION_PRICE,
        currency="eur",
        payment_status="pending",
        metadata=checkout_request.metadata
    )
    
    await db.payment_transactions.insert_one(transaction.dict())
    
    return {"checkout_url": session.url, "session_id": session.session_id}

@api_router.get("/subscription/status/{session_id}")
async def get_subscription_status(session_id: str, current_user: dict = Depends(get_current_active_user)):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    status_response = await stripe_checkout.get_checkout_status(session_id)
    
    # Update transaction status
    transaction = await db.payment_transactions.find_one({"session_id": session_id})
    if transaction:
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "payment_status": status_response.payment_status,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Update user subscription status if payment successful
        if status_response.payment_status == "paid":
            await db.users.update_one(
                {"id": current_user["id"]},
                {
                    "$set": {
                        "subscription_status": "active",
                        "subscription_session_id": session_id,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
    
    return status_response.dict()

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    webhook_response = await stripe_checkout.handle_webhook(body, signature)
    
    # Update transaction and user based on webhook
    if webhook_response.event_type == "checkout.session.completed":
        await db.payment_transactions.update_one(
            {"session_id": webhook_response.session_id},
            {
                "$set": {
                    "payment_status": webhook_response.payment_status,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        if webhook_response.payment_status == "paid":
            user_id = webhook_response.metadata.get("user_id")
            if user_id:
                await db.users.update_one(
                    {"id": user_id},
                    {
                        "$set": {
                            "subscription_status": "active",
                            "subscription_session_id": webhook_response.session_id,
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
    
    return {"status": "success"}

# =============================================================================
# RESTAURANT ENDPOINTS
# =============================================================================

@api_router.post("/restaurants", response_model=Restaurant)
async def create_restaurant(
    restaurant_data: RestaurantCreate,
    current_user: dict = Depends(get_current_subscribed_user)
):
    restaurant = Restaurant(
        user_id=current_user["id"],
        **restaurant_data.dict()
    )
    
    await db.restaurants.insert_one(restaurant.dict())
    return restaurant

@api_router.get("/restaurants", response_model=List[Restaurant])
async def get_restaurants(current_user: dict = Depends(get_current_subscribed_user)):
    restaurants = await db.restaurants.find({"user_id": current_user["id"]}).to_list(1000)
    # Remove MongoDB ObjectId
    return [{k: v for k, v in restaurant.items() if k != "_id"} for restaurant in restaurants]

@api_router.get("/restaurants/{restaurant_id}", response_model=Restaurant)
async def get_restaurant(
    restaurant_id: str,
    current_user: dict = Depends(get_current_subscribed_user)
):
    restaurant = await db.restaurants.find_one({
        "id": restaurant_id,
        "user_id": current_user["id"]
    })
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return restaurant

@api_router.put("/restaurants/{restaurant_id}", response_model=Restaurant)
async def update_restaurant(
    restaurant_id: str,
    restaurant_data: RestaurantCreate,
    current_user: dict = Depends(get_current_subscribed_user)
):
    restaurant = await db.restaurants.find_one({
        "id": restaurant_id,
        "user_id": current_user["id"]
    })
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {
            "$set": {
                **restaurant_data.dict(),
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    updated_restaurant = await db.restaurants.find_one({"id": restaurant_id})
    return updated_restaurant

@api_router.delete("/restaurants/{restaurant_id}")
async def delete_restaurant(
    restaurant_id: str,
    current_user: dict = Depends(get_current_subscribed_user)
):
    restaurant = await db.restaurants.find_one({
        "id": restaurant_id,
        "user_id": current_user["id"]
    })
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    # Delete all menus and dishes for this restaurant
    menus = await db.menus.find({"restaurant_id": restaurant_id}).to_list(1000)
    for menu in menus:
        await db.dishes.delete_many({"menu_id": menu["id"]})
    await db.menus.delete_many({"restaurant_id": restaurant_id})
    
    # Delete the restaurant
    await db.restaurants.delete_one({"id": restaurant_id})
    
    return {"message": "Restaurant deleted successfully"}

# =============================================================================
# MENU ENDPOINTS
# =============================================================================

@api_router.post("/menus", response_model=Menu)
async def create_menu(
    menu_data: MenuCreate,
    current_user: dict = Depends(get_current_subscribed_user)
):
    # Verify restaurant belongs to user
    restaurant = await db.restaurants.find_one({
        "id": menu_data.restaurant_id,
        "user_id": current_user["id"]
    })
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    menu = Menu(**menu_data.dict())
    
    # Generate QR code for menu
    public_menu_url = f"https://spaceqrpro.com/menu/{menu.id}"  # This will be the public URL
    menu.qr_code = generate_qr_code(public_menu_url)
    
    await db.menus.insert_one(menu.dict())
    return menu

@api_router.get("/menus", response_model=List[Menu])
async def get_menus(current_user: dict = Depends(get_current_subscribed_user)):
    # Get all menus for user's restaurants
    restaurants = await db.restaurants.find({"user_id": current_user["id"]}).to_list(1000)
    restaurant_ids = [r["id"] for r in restaurants]
    
    menus = await db.menus.find({"restaurant_id": {"$in": restaurant_ids}}).to_list(1000)
    return menus

@api_router.get("/menus/{menu_id}", response_model=Menu)
async def get_menu(
    menu_id: str,
    current_user: dict = Depends(get_current_subscribed_user)
):
    menu = await db.menus.find_one({"id": menu_id})
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    # Verify menu belongs to user's restaurant
    restaurant = await db.restaurants.find_one({
        "id": menu["restaurant_id"],
        "user_id": current_user["id"]
    })
    if not restaurant:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    return menu

@api_router.put("/menus/{menu_id}", response_model=Menu)
async def update_menu(
    menu_id: str,
    menu_data: MenuCreate,
    current_user: dict = Depends(get_current_subscribed_user)
):
    menu = await db.menus.find_one({"id": menu_id})
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    # Verify menu belongs to user's restaurant
    restaurant = await db.restaurants.find_one({
        "id": menu["restaurant_id"],
        "user_id": current_user["id"]
    })
    if not restaurant:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    await db.menus.update_one(
        {"id": menu_id},
        {
            "$set": {
                "name": menu_data.name,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    updated_menu = await db.menus.find_one({"id": menu_id})
    return updated_menu

@api_router.delete("/menus/{menu_id}")
async def delete_menu(
    menu_id: str,
    current_user: dict = Depends(get_current_subscribed_user)
):
    menu = await db.menus.find_one({"id": menu_id})
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    # Verify menu belongs to user's restaurant
    restaurant = await db.restaurants.find_one({
        "id": menu["restaurant_id"],
        "user_id": current_user["id"]
    })
    if not restaurant:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    # Delete all dishes for this menu
    await db.dishes.delete_many({"menu_id": menu_id})
    
    # Delete the menu
    await db.menus.delete_one({"id": menu_id})
    
    return {"message": "Menu deleted successfully"}

# =============================================================================
# DISH ENDPOINTS
# =============================================================================

@api_router.post("/dishes", response_model=Dish)
async def create_dish(
    dish_data: DishCreate,
    current_user: dict = Depends(get_current_subscribed_user)
):
    # Verify menu belongs to user
    menu = await db.menus.find_one({"id": dish_data.menu_id})
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    restaurant = await db.restaurants.find_one({
        "id": menu["restaurant_id"],
        "user_id": current_user["id"]
    })
    if not restaurant:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    dish = Dish(**dish_data.dict())
    await db.dishes.insert_one(dish.dict())
    return dish

@api_router.get("/dishes", response_model=List[Dish])
async def get_dishes(menu_id: str, current_user: dict = Depends(get_current_subscribed_user)):
    # Verify menu belongs to user
    menu = await db.menus.find_one({"id": menu_id})
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    restaurant = await db.restaurants.find_one({
        "id": menu["restaurant_id"],
        "user_id": current_user["id"]
    })
    if not restaurant:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    dishes = await db.dishes.find({"menu_id": menu_id}).to_list(1000)
    return dishes

@api_router.put("/dishes/{dish_id}", response_model=Dish)
async def update_dish(
    dish_id: str,
    dish_data: DishCreate,
    current_user: dict = Depends(get_current_subscribed_user)
):
    dish = await db.dishes.find_one({"id": dish_id})
    if not dish:
        raise HTTPException(status_code=404, detail="Dish not found")
    
    # Verify dish belongs to user's menu
    menu = await db.menus.find_one({"id": dish["menu_id"]})
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    restaurant = await db.restaurants.find_one({
        "id": menu["restaurant_id"],
        "user_id": current_user["id"]
    })
    if not restaurant:
        raise HTTPException(status_code=404, detail="Dish not found")
    
    await db.dishes.update_one(
        {"id": dish_id},
        {
            "$set": {
                **dish_data.dict(),
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    updated_dish = await db.dishes.find_one({"id": dish_id})
    return updated_dish

@api_router.delete("/dishes/{dish_id}")
async def delete_dish(
    dish_id: str,
    current_user: dict = Depends(get_current_subscribed_user)
):
    dish = await db.dishes.find_one({"id": dish_id})
    if not dish:
        raise HTTPException(status_code=404, detail="Dish not found")
    
    # Verify dish belongs to user's menu
    menu = await db.menus.find_one({"id": dish["menu_id"]})
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    restaurant = await db.restaurants.find_one({
        "id": menu["restaurant_id"],
        "user_id": current_user["id"]
    })
    if not restaurant:
        raise HTTPException(status_code=404, detail="Dish not found")
    
    await db.dishes.delete_one({"id": dish_id})
    return {"message": "Dish deleted successfully"}

# =============================================================================
# PUBLIC ENDPOINTS (NO AUTH REQUIRED)
# =============================================================================

@api_router.get("/public/menu/{menu_id}")
async def get_public_menu(menu_id: str):
    menu = await db.menus.find_one({"id": menu_id, "is_active": True})
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    restaurant = await db.restaurants.find_one({"id": menu["restaurant_id"]})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    dishes = await db.dishes.find({"menu_id": menu_id, "is_available": True}).to_list(1000)
    
    return {
        "menu": menu,
        "restaurant": restaurant,
        "dishes": dishes
    }

# =============================================================================
# ADMIN ENDPOINTS
# =============================================================================

@api_router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_active_user)):
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = await db.users.find({}).to_list(1000)
    for user in users:
        user.pop("password_hash", None)
    return users

@api_router.get("/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_active_user)):
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    total_users = await db.users.count_documents({})
    active_subscribers = await db.users.count_documents({"subscription_status": "active"})
    total_restaurants = await db.restaurants.count_documents({})
    total_menus = await db.menus.count_documents({})
    total_dishes = await db.dishes.count_documents({})
    total_transactions = await db.payment_transactions.count_documents({})
    
    return {
        "total_users": total_users,
        "active_subscribers": active_subscribers,
        "total_restaurants": total_restaurants,
        "total_menus": total_menus,
        "total_dishes": total_dishes,
        "total_transactions": total_transactions
    }

# =============================================================================
# BASIC ENDPOINTS
# =============================================================================

@api_router.get("/")
async def root():
    return {"message": "Space QR Pro API is running!"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

# Include the router in the main app
app.include_router(api_router)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()