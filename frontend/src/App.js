import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { 
  User, 
  Plus, 
  Edit, 
  Trash2, 
  QrCode, 
  Settings, 
  LogOut,
  Crown,
  CreditCard,
  FileText,
  ChefHat,
  Smartphone,
  CheckCircle,
  X,
  Eye,
  Upload,
  Save,
  ArrowLeft,
  Users,
  TrendingUp,
  DollarSign,
  Star
} from 'lucide-react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Error fetching user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { access_token, user: userData } = response.data;
      
      setToken(access_token);
      setUser(userData);
      localStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Login failed' };
    }
  };

  const register = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/register`, { email, password });
      const { access_token, user: userData } = response.data;
      
      setToken(access_token);
      setUser(userData);
      localStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Registration failed' };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Components
const Header = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo-section">
          <h1 className="logo">Space QR Pro</h1>
          {user?.subscription_status === 'active' && (
            <span className="premium-badge">
              <Crown size={16} />
              Premium
            </span>
          )}
        </div>
        
        {user && (
          <div className="header-actions">
            <span className="user-email">{user.email}</span>
            <button onClick={() => navigate('/dashboard')} className="nav-button">
              Dashboard
            </button>
            <button onClick={logout} className="nav-button logout">
              <LogOut size={16} />
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = isLogin ? await login(email, password) : await register(email, password);
    
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p className="login-subtitle">
            {isLogin ? 'Sign in to your Space QR Pro account' : 'Join Space QR Pro today'}
          </p>
          
          {error && (
            <div className="error-message">
              <X size={16} />
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input"
                placeholder="Enter your email"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-input"
                placeholder="Enter your password"
              />
            </div>
            
            <button type="submit" disabled={loading} className="login-button">
              {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
            </button>
          </form>
          
          <div className="login-footer">
            <p>
              {isLogin ? "Don't have an account?" : "Already have an account?"}
              <button 
                type="button" 
                onClick={() => setIsLogin(!isLogin)}
                className="link-button"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const SubscriptionPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSubscribe = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API}/subscription/create-checkout`, {
        host_url: window.location.origin
      });
      
      window.location.href = response.data.checkout_url;
    } catch (error) {
      setError(error.response?.data?.detail || 'Failed to create checkout session');
      setLoading(false);
    }
  };

  if (user?.subscription_status === 'active') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="subscription-page">
      <div className="subscription-container">
        <div className="subscription-card">
          <div className="subscription-header">
            <Crown size={48} className="subscription-icon" />
            <h2>Unlock Premium Features</h2>
            <p>Start creating professional digital menus with QR codes</p>
          </div>
          
          <div className="pricing-section">
            <div className="price">
              <span className="currency">€</span>
              <span className="amount">9.99</span>
              <span className="period">/month</span>
            </div>
          </div>
          
          <div className="features-list">
            <div className="feature-item">
              <CheckCircle size={20} />
              <span>Unlimited restaurants</span>
            </div>
            <div className="feature-item">
              <CheckCircle size={20} />
              <span>Unlimited menus</span>
            </div>
            <div className="feature-item">
              <CheckCircle size={20} />
              <span>Unlimited dishes</span>
            </div>
            <div className="feature-item">
              <CheckCircle size={20} />
              <span>Auto-generated QR codes</span>
            </div>
            <div className="feature-item">
              <CheckCircle size={20} />
              <span>Public menu pages</span>
            </div>
            <div className="feature-item">
              <CheckCircle size={20} />
              <span>Premium support</span>
            </div>
          </div>
          
          {error && (
            <div className="error-message">
              <X size={16} />
              {error}
            </div>
          )}
          
          <button 
            onClick={handleSubscribe}
            disabled={loading}
            className="subscribe-button"
          >
            <CreditCard size={20} />
            {loading ? 'Processing...' : 'Subscribe Now'}
          </button>
          
          <p className="subscription-note">
            Secure payment powered by Stripe. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [restaurants, setRestaurants] = useState([]);
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('restaurants');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user?.subscription_status !== 'active') {
      // Check if coming from successful payment
      const urlParams = new URLSearchParams(location.search);
      const sessionId = urlParams.get('session_id');
      
      if (sessionId) {
        checkPaymentStatus(sessionId);
      } else {
        navigate('/subscription');
      }
    } else {
      fetchData();
    }
  }, [user, location]);

  const checkPaymentStatus = async (sessionId) => {
    try {
      const response = await axios.get(`${API}/subscription/status/${sessionId}`);
      if (response.data.payment_status === 'paid') {
        // Refresh user data
        window.location.reload();
      } else {
        navigate('/subscription');
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
      navigate('/subscription');
    }
  };

  const fetchData = async () => {
    try {
      const [restaurantsRes, menusRes] = await Promise.all([
        axios.get(`${API}/restaurants`),
        axios.get(`${API}/menus`)
      ]);
      
      setRestaurants(restaurantsRes.data);
      setMenus(menusRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRestaurant = (formData) => {
    axios.post(`${API}/restaurants`, formData)
      .then(response => {
        setRestaurants([...restaurants, response.data]);
        setShowModal(false);
      })
      .catch(error => console.error('Error creating restaurant:', error));
  };

  const handleCreateMenu = (formData) => {
    axios.post(`${API}/menus`, formData)
      .then(response => {
        setMenus([...menus, response.data]);
        setShowModal(false);
      })
      .catch(error => console.error('Error creating menu:', error));
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    
    try {
      await axios.delete(`${API}/${type}/${id}`);
      if (type === 'restaurants') {
        setRestaurants(restaurants.filter(r => r.id !== id));
      } else if (type === 'menus') {
        setMenus(menus.filter(m => m.id !== id));
      }
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const openModal = (type, item = null) => {
    setModalType(type);
    setSelectedItem(item);
    setShowModal(true);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <div className="dashboard-tabs">
          <button 
            className={activeTab === 'restaurants' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('restaurants')}
          >
            <User size={20} />
            Restaurants
          </button>
          <button 
            className={activeTab === 'menus' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('menus')}
          >
            <FileText size={20} />
            Menus
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {activeTab === 'restaurants' && (
          <div className="content-section">
            <div className="section-header">
              <h3>Your Restaurants</h3>
              <button 
                className="create-button"
                onClick={() => openModal('restaurant')}
              >
                <Plus size={20} />
                Add Restaurant
              </button>
            </div>
            
            <div className="items-grid">
              {restaurants.map(restaurant => (
                <div key={restaurant.id} className="item-card">
                  {restaurant.logo && (
                    <img src={restaurant.logo} alt={restaurant.name} className="item-image" />
                  )}
                  <h4>{restaurant.name}</h4>
                  <p>{restaurant.address}</p>
                  <p>{restaurant.phone}</p>
                  <div className="item-actions">
                    <button 
                      className="action-button edit"
                      onClick={() => openModal('restaurant', restaurant)}
                    >
                      <Edit size={16} />
                    </button>
                    <button 
                      className="action-button delete"
                      onClick={() => handleDelete('restaurants', restaurant.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'menus' && (
          <div className="content-section">
            <div className="section-header">
              <h3>Your Menus</h3>
              <button 
                className="create-button"
                onClick={() => openModal('menu')}
              >
                <Plus size={20} />
                Add Menu
              </button>
            </div>
            
            <div className="items-grid">
              {menus.map(menu => (
                <div key={menu.id} className="item-card">
                  <h4>{menu.name}</h4>
                  <p>Restaurant: {restaurants.find(r => r.id === menu.restaurant_id)?.name}</p>
                  {menu.qr_code && (
                    <img src={menu.qr_code} alt="QR Code" className="qr-code" />
                  )}
                  <div className="item-actions">
                    <button 
                      className="action-button view"
                      onClick={() => navigate(`/menu/${menu.id}/manage`)}
                    >
                      <Eye size={16} />
                    </button>
                    <button 
                      className="action-button edit"
                      onClick={() => openModal('menu', menu)}
                    >
                      <Edit size={16} />
                    </button>
                    <button 
                      className="action-button delete"
                      onClick={() => handleDelete('menus', menu.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <Modal 
          type={modalType}
          item={selectedItem}
          restaurants={restaurants}
          onClose={() => setShowModal(false)}
          onSubmit={modalType === 'restaurant' ? handleCreateRestaurant : handleCreateMenu}
        />
      )}
    </div>
  );
};

const Modal = ({ type, item, restaurants, onClose, onSubmit }) => {
  const [formData, setFormData] = useState(
    item ? { ...item } : 
    type === 'restaurant' ? { name: '', address: '', phone: '', logo: '' } :
    { name: '', restaurant_id: '' }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData({ ...formData, logo: e.target.result });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>{item ? 'Edit' : 'Create'} {type === 'restaurant' ? 'Restaurant' : 'Menu'}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="form-input"
            />
          </div>
          
          {type === 'restaurant' && (
            <>
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  required
                  className="form-input"
                />
              </div>
              
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  className="form-input"
                />
              </div>
              
              <div className="form-group">
                <label>Logo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="form-input"
                />
                {formData.logo && (
                  <img src={formData.logo} alt="Logo preview" className="image-preview" />
                )}
              </div>
            </>
          )}
          
          {type === 'menu' && !item && (
            <div className="form-group">
              <label>Restaurant</label>
              <select
                value={formData.restaurant_id}
                onChange={(e) => setFormData({ ...formData, restaurant_id: e.target.value })}
                required
                className="form-input"
              >
                <option value="">Select a restaurant</option>
                {restaurants.map(restaurant => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="secondary-button">
              Cancel
            </button>
            <button type="submit" className="primary-button">
              <Save size={16} />
              {item ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const MenuManagement = () => {
  const [menu, setMenu] = useState(null);
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedDish, setSelectedDish] = useState(null);
  const { menuId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    fetchMenuData();
  }, [menuId]);

  const fetchMenuData = async () => {
    try {
      const [menuRes, dishesRes] = await Promise.all([
        axios.get(`${API}/menus/${menuId}`),
        axios.get(`${API}/dishes?menu_id=${menuId}`)
      ]);
      
      setMenu(menuRes.data);
      setDishes(dishesRes.data);
    } catch (error) {
      console.error('Error fetching menu data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDish = (formData) => {
    axios.post(`${API}/dishes`, { ...formData, menu_id: menuId })
      .then(response => {
        setDishes([...dishes, response.data]);
        setShowModal(false);
      })
      .catch(error => console.error('Error creating dish:', error));
  };

  const handleDeleteDish = async (dishId) => {
    if (!window.confirm('Are you sure you want to delete this dish?')) return;
    
    try {
      await axios.delete(`${API}/dishes/${dishId}`);
      setDishes(dishes.filter(d => d.id !== dishId));
    } catch (error) {
      console.error('Error deleting dish:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="menu-management">
      <div className="menu-header">
        <button className="back-button" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} />
          Back to Dashboard
        </button>
        <h2>{menu?.name} - Dish Management</h2>
        <button 
          className="create-button"
          onClick={() => setShowModal(true)}
        >
          <Plus size={20} />
          Add Dish
        </button>
      </div>

      <div className="dishes-grid">
        {dishes.map(dish => (
          <div key={dish.id} className="dish-card">
            {dish.image && (
              <img src={dish.image} alt={dish.name} className="dish-image" />
            )}
            <div className="dish-info">
              <h4>{dish.name}</h4>
              <p className="dish-description">{dish.description}</p>
              <p className="dish-price">€{dish.price.toFixed(2)}</p>
              {dish.options.length > 0 && (
                <div className="dish-options">
                  <strong>Options:</strong>
                  <ul>
                    {dish.options.map((option, index) => (
                      <li key={index}>{option}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="dish-actions">
              <button 
                className="action-button edit"
                onClick={() => {
                  setSelectedDish(dish);
                  setShowModal(true);
                }}
              >
                <Edit size={16} />
              </button>
              <button 
                className="action-button delete"
                onClick={() => handleDeleteDish(dish.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <DishModal
          dish={selectedDish}
          onClose={() => {
            setShowModal(false);
            setSelectedDish(null);
          }}
          onSubmit={handleCreateDish}
        />
      )}
    </div>
  );
};

const DishModal = ({ dish, onClose, onSubmit }) => {
  const [formData, setFormData] = useState(
    dish ? { ...dish, options: dish.options.join('\n') } : {
      name: '',
      description: '',
      price: '',
      image: '',
      options: ''
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      price: parseFloat(formData.price),
      options: formData.options.split('\n').filter(opt => opt.trim())
    };
    onSubmit(submitData);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData({ ...formData, image: e.target.result });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal large">
        <div className="modal-header">
          <h3>{dish ? 'Edit' : 'Create'} Dish</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              className="form-textarea"
              rows="3"
            />
          </div>
          
          <div className="form-group">
            <label>Price (€)</label>
            <input
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              required
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label>Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="form-input"
            />
            {formData.image && (
              <img src={formData.image} alt="Dish preview" className="image-preview" />
            )}
          </div>
          
          <div className="form-group">
            <label>Options (one per line)</label>
            <textarea
              value={formData.options}
              onChange={(e) => setFormData({ ...formData, options: e.target.value })}
              className="form-textarea"
              rows="4"
              placeholder="Extra cheese&#10;Large portion&#10;Spicy"
            />
          </div>
          
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="secondary-button">
              Cancel
            </button>
            <button type="submit" className="primary-button">
              <Save size={16} />
              {dish ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PublicMenu = () => {
  const [menuData, setMenuData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { menuId } = useParams();

  useEffect(() => {
    fetchPublicMenu();
  }, [menuId]);

  const fetchPublicMenu = async () => {
    try {
      const response = await axios.get(`${API}/public/menu/${menuId}`);
      setMenuData(response.data);
    } catch (error) {
      console.error('Error fetching public menu:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading menu...</div>;
  }

  if (!menuData) {
    return <div className="error">Menu not found</div>;
  }

  const { menu, restaurant, dishes } = menuData;

  return (
    <div className="public-menu">
      <div className="menu-header">
        {restaurant.logo && (
          <img src={restaurant.logo} alt={restaurant.name} className="restaurant-logo" />
        )}
        <h1>{restaurant.name}</h1>
        <p className="restaurant-info">{restaurant.address}</p>
        <p className="restaurant-info">{restaurant.phone}</p>
        <h2 className="menu-title">{menu.name}</h2>
      </div>

      <div className="menu-dishes">
        {dishes.map(dish => (
          <div key={dish.id} className="menu-dish">
            {dish.image && (
              <img src={dish.image} alt={dish.name} className="menu-dish-image" />
            )}
            <div className="menu-dish-info">
              <h3>{dish.name}</h3>
              <p className="menu-dish-description">{dish.description}</p>
              {dish.options.length > 0 && (
                <div className="menu-dish-options">
                  <strong>Available options:</strong>
                  <ul>
                    {dish.options.map((option, index) => (
                      <li key={index}>{option}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="menu-dish-price">€{dish.price.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="menu-footer">
        <p>Powered by Space QR Pro</p>
      </div>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="loading">Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Main App Component
function App() {
  return (
    <div className="App">
      <AuthProvider>
        <Router>
          <Header />
          <main className="main-content">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/menu/:menuId" element={<PublicMenu />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/subscription" element={
                <ProtectedRoute>
                  <SubscriptionPage />
                </ProtectedRoute>
              } />
              <Route path="/menu/:menuId/manage" element={
                <ProtectedRoute>
                  <MenuManagement />
                </ProtectedRoute>
              } />
            </Routes>
          </main>
        </Router>
      </AuthProvider>
    </div>
  );
}

export default App;