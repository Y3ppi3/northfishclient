import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Cart.css';

// Константа для максимального количества
const MAX_QUANTITY = 99;

// Интерфейс для элемента корзины
interface CartItem {
  id: number;
  product_id: number;
  quantity: number;
  user_id: number;
  product: {
    id: number;
    name: string;
    price: number;
    description?: string;
    image_url?: string;
    weight?: string;
    category_id: number;
  };
}

interface CartProps {
  updateCartCount: () => void;
}

// Функция для создания debounce
const useDebounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): T => {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  return useCallback(
    ((...args) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setTimeoutId(
        setTimeout(() => {
          func(...args);
        }, delay)
      );
    }) as T,
    [func, delay]
  );
};

const Cart: React.FC<CartProps> = ({ updateCartCount }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<number | null>(null);
  const [isClearingCart, setIsClearingCart] = useState(false);
  const navigate = useNavigate();

  // Функция для безопасной работы с fetch
  const safeFetch = async (url: string, options?: RequestInit) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // таймаут 5 секунд
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // Пытаемся получить сообщение ошибки от сервера
        try {
          const errorData = await response.json();
          throw new Error(errorData.detail || `Ошибка статус: ${response.status}`);
        } catch (parseError) {
          throw new Error(`Ошибка статус: ${response.status}`);
        }
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Ошибка при выполнении запроса:', error);
      
      if (error.name === 'AbortError') {
        throw new Error('Превышено время ожидания ответа от сервера');
      }
      
      throw error;
    }
  };

  const fetchCartItems = async () => {
    try {
      setLoading(true);
      setError(null);
      // Добавляем случайный параметр к запросу, чтобы избежать кэширования
      const cacheBuster = new Date().getTime();
      
      // Определяем базовый URL для API
      const baseUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:8000' 
        : 'http://127.0.0.1:8000';
      
      const data = await safeFetch(`${baseUrl}/cart/?_=${cacheBuster}`);
      
      // Валидируем полученные данные
      if (!Array.isArray(data)) {
        throw new Error('Неверный формат данных от сервера');
      }
      
      setCartItems(data);
      setLoading(false);
    } catch (error: any) {
      console.error('Ошибка при загрузке корзины:', error);
      
      setError('Не удалось загрузить корзину. Пожалуйста, попробуйте позже.');
      // Устанавливаем пустой массив для работы с пустой корзиной
      setCartItems([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 2;

    const loadCart = async () => {
      try {
        await fetchCartItems();
      } catch (error) {
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Попытка загрузки корзины ${retryCount} из ${maxRetries}...`);
          setTimeout(loadCart, 1000); // повторяем через 1 секунду
        }
      }
    };

    loadCart();
  }, []);

  const handleQuantityChange = useDebounce(async (itemId: number, newQuantity: number) => {
    // Проверка на допустимые значения
    if (newQuantity < 1) {
      setError('Количество товара не может быть меньше 1');
      return;
    }
    
    if (newQuantity > MAX_QUANTITY) {
      setError(`Максимальное количество товара - ${MAX_QUANTITY}`);
      return;
    }
    
    try {
      // Сброс ошибки при валидных данных
      setError(null);
      
      // Устанавливаем флаг обновления
      setIsUpdating(itemId);
      
      // Оптимистичное обновление UI
      setCartItems(prevItems => 
        prevItems.map(item => 
          item.id === itemId ? { ...item, quantity: newQuantity } : item
        )
      );
      
      // Определяем базовый URL для API
      const baseUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:8000' 
        : 'http://127.0.0.1:8000';
      
      // Отправляем запрос на сервер
      await safeFetch(`${baseUrl}/cart/${itemId}?quantity=${newQuantity}`, {
        method: 'PUT',
      });
      
      // Обновляем счетчик корзины
      updateCartCount();
    } catch (error: any) {
      console.error('Ошибка при обновлении количества:', error);
      setError(error.message || 'Не удалось обновить количество. Пожалуйста, попробуйте позже.');
      
      // Восстанавливаем предыдущие данные
      await fetchCartItems();
    } finally {
      setIsUpdating(null);
    }
  }, 300);

  const handleRemoveItem = async (itemId: number) => {
    try {
      // Флаг обновления
      setIsUpdating(itemId);
      
      // Оптимистичное обновление UI
      setCartItems(prevItems => prevItems.filter(item => item.id !== itemId));
      
      // Определяем базовый URL для API
      const baseUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:8000' 
        : 'http://127.0.0.1:8000';
      
      // Отправляем запрос
      await safeFetch(`${baseUrl}/cart/${itemId}`, {
        method: 'DELETE',
      });
      
      // Обновляем счетчик
      updateCartCount();
    } catch (error: any) {
      console.error('Ошибка при удалении товара:', error);
      setError('Не удалось удалить товар. Пожалуйста, попробуйте позже.');
      
      // Восстанавливаем данные
      await fetchCartItems();
    } finally {
      setIsUpdating(null);
    }
  };

  // Функция для полной очистки корзины
  const handleClearCart = async () => {
    // Спрашиваем подтверждение у пользователя
    if (!window.confirm('Вы действительно хотите очистить всю корзину?')) {
      return;
    }

    try {
      setIsClearingCart(true);
      setError(null);
      
      // Определяем базовый URL для API
      const baseUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:8000' 
        : 'http://127.0.0.1:8000';
      
      // Отправляем запрос на очистку корзины
      await safeFetch(`${baseUrl}/cart/clear`, {
        method: 'DELETE',
      });
      
      // Обновляем UI
      setCartItems([]);
      
      // Обновляем счетчик корзины
      updateCartCount();
      
      // Показываем сообщение об успехе
      alert('Корзина успешно очищена!');
    } catch (error: any) {
      console.error('Ошибка при очистке корзины:', error);
      setError('Не удалось очистить корзину. Пожалуйста, попробуйте позже.');
      
      // Восстанавливаем данные
      await fetchCartItems();
    } finally {
      setIsClearingCart(false);
    }
  };

  const handleCheckout = async () => {
    try {
      setLoading(true);
      
      // Определяем базовый URL для API
      const baseUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:8000' 
        : 'http://127.0.0.1:8000';
      
      await safeFetch(`${baseUrl}/orders/`, {
        method: 'POST',
      });
      
      // Обновляем корзину и счетчик
      await fetchCartItems();
      updateCartCount();
      
      setLoading(false);
      alert('Заказ успешно оформлен!');
      navigate('/');
    } catch (error: any) {
      console.error('Ошибка при оформлении заказа:', error);
      setError('Не удалось оформить заказ. Пожалуйста, попробуйте позже.');
      setLoading(false);
    }
  };

  // Функция для форматирования цены
  const formatPrice = (price: number): string => {
    // Если цена целое число, возвращаем без десятичной части
    if (Number.isInteger(price)) {
      return `${price} ₽`;
    }
    // Иначе округляем до 2 знаков после запятой
    return `${price.toFixed(2)} ₽`;
  };

  // Вычисляем общую стоимость корзины
  const totalPrice = cartItems.reduce((sum, item) => {
    return sum + (item.product?.price || 0) * item.quantity;
  }, 0);

  if (loading) {
    return (
      <div className="cart-container">
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>Загрузка корзины...</p>
        </div>
      </div>
    );
  }

  // Показываем ошибку, но продолжаем отображать корзину, если есть товары
  const showError = error && (
    <div className="error-container">
      <div className="error">{error}</div>
    </div>
  );

  if (cartItems.length === 0) {
    return (
      <div className="cart-container">
        {showError}
        <div className="empty-cart">
          <h2>Ваша корзина пока пуста</h2>
          <p>Добавьте свежую рыбу и морепродукты, чтобы оформить заказ</p>
          <button onClick={() => navigate('/products')} className="continue-shopping">
            Перейти в каталог
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-container">
      <h1>Ваша корзина</h1>
      
      {showError}
      
      {/* Кнопка очистки корзины */}
      <div className="cart-controls">
        <button 
          className={`clear-cart-button ${isClearingCart ? 'clearing' : ''}`}
          onClick={handleClearCart}
          disabled={isClearingCart || isUpdating !== null}
        >
          {/* Иконка корзины */}
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
          {isClearingCart ? 'Очистка...' : 'Очистить корзину'}
        </button>
      </div>
      
      <div className="cart-items">
        {cartItems.map((item) => (
          <div 
            key={item.id} 
            className={`cart-item ${isUpdating === item.id ? 'updating' : ''}`}>
            {item.product?.image_url && (
              <div className="item-image">
                <img src={item.product.image_url} alt={item.product?.name || 'Товар'} />
              </div>
            )}
            
            <div className="item-details">
              <h3>{item.product?.name || 'Товар'}</h3>
              {item.product?.weight && <p className="item-weight">Вес: {item.product.weight}</p>}
              <p className="item-price">{formatPrice(item.product?.price || 0)}</p>
            </div>
            
            <div className="item-quantity">
              <button 
                onClick={() => handleQuantityChange(item.id, item.quantity - 1)} 
                disabled={item.quantity <= 1 || isUpdating === item.id}
                className="quantity-btn"
                aria-label="Уменьшить количество"
              >
                −
              </button>
              <input
                type="number"
                min="1"
                max={MAX_QUANTITY}
                value={item.quantity}
                onChange={(e) => {
                  const newQuantity = parseInt(e.target.value, 10) || 1;
                  if (newQuantity >= 1 && newQuantity <= MAX_QUANTITY) {
                    handleQuantityChange(item.id, newQuantity);
                  }
                }}
                className="quantity-input"
                disabled={isUpdating === item.id}
                aria-label="Количество товара"
              />
              <button 
                onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                disabled={isUpdating === item.id || item.quantity >= MAX_QUANTITY}
                className="quantity-btn"
                aria-label="Увеличить количество"
              >
                +
              </button>
            </div>
            
            <div className="item-total">
              <p>{formatPrice((item.product?.price || 0) * item.quantity)}</p>
            </div>
            
            <button 
              className="remove-button" 
              onClick={() => handleRemoveItem(item.id)}
              disabled={isUpdating === item.id}
              aria-label="Удалить товар"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      
      <div className="cart-summary">
        <div className="cart-total">
          <h2>Итого:</h2>
          <p className="total-price">{formatPrice(totalPrice)}</p>
        </div>
        
        <div className="cart-buttons">
          <button 
            onClick={handleCheckout} 
            className="checkout-button"
            disabled={loading}
          >
            Оформить заказ
          </button>
          
          <button onClick={() => navigate('/products')} className="continue-shopping">
            Продолжить покупки
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;