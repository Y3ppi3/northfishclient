import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Cart.css';

// Добавляем стили для плавных переходов
const cartItemTransition = {
  transition: 'all 0.2s ease-in-out',
  overflow: 'hidden',
};

// Константа для максимального количества
const MAX_QUANTITY = 999;
// Максимальное количество символов, которое можно ввести (2 для значения 99)
const MAX_DIGITS = String(MAX_QUANTITY).length;

// Определяем базовые URL для API
const getBaseApiUrl = () => {
  // Сначала проверяем переменные окружения (если они доступны через Vite)
  if (import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Затем пробуем получить URL из локального хранилища (для переключения между средами)
  const savedUrl = localStorage.getItem('apiBaseUrl');
  if (savedUrl) {
    return savedUrl;
  }
  
  // По умолчанию используем localhost:8000
  return 'http://localhost:8000';
};

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

// Функция для работы с локальным хранилищем корзины
const useLocalCart = () => {
  const getLocalCart = (): CartItem[] => {
    try {
      const localCart = localStorage.getItem('localCart');
      return localCart ? JSON.parse(localCart) : [];
    } catch (error) {
      console.error('Ошибка при чтении локальной корзины:', error);
      return [];
    }
  };

  const saveLocalCart = (items: CartItem[]) => {
    try {
      // Убедимся, что все элементы в корзине имеют количество не больше MAX_QUANTITY
      const validatedItems = items.map(item => ({
        ...item,
        quantity: Math.min(item.quantity || 1, MAX_QUANTITY)
      }));
      localStorage.setItem('localCart', JSON.stringify(validatedItems));
    } catch (error) {
      console.error('Ошибка при сохранении локальной корзины:', error);
    }
  };

  return { getLocalCart, saveLocalCart };
};

const Cart: React.FC<CartProps> = ({ updateCartCount }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<number | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [baseApiUrl, setBaseApiUrl] = useState(getBaseApiUrl());
  const [quantityWarning, setQuantityWarning] = useState<string | null>(null);
  const navigate = useNavigate();
  const { getLocalCart, saveLocalCart } = useLocalCart();

  // Улучшенная функция для безопасной работы с fetch
  const safeFetch = async (url: string, options?: RequestInit) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // таймаут 8 секунд
      
      // Добавляем credentials: 'include' для работы с куками и CORS
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        credentials: 'include',
        // Добавляем заголовки для лучшей совместимости с CORS
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options?.headers || {})
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // Пытаемся получить сообщение ошибки от сервера
        try {
          const errorData = await response.json();
          throw new Error(errorData.detail || `Ошибка ${response.status}: ${response.statusText}`);
        } catch (parseError) {
          throw new Error(`Ошибка ${response.status}: ${response.statusText}`);
        }
      }
      
      return await response.json();
    } catch (error: any) {
      // Определяем тип ошибки
      if (error.name === 'AbortError') {
        throw new Error('Превышено время ожидания ответа от сервера');
      }
      
      // Ошибки CORS и сети обычно появляются как TypeError: Failed to fetch
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        // Переходим в оффлайн режим
        setIsOfflineMode(true);
        throw new Error('Сервер недоступен или проблема с CORS. Переключаемся в оффлайн режим');
      }
      
      throw error;
    }
  };

  // Функция для проверки и корректировки количества товаров из API
  const validateCartData = (data: CartItem[]): CartItem[] => {
    let hasQuantityIssues = false;
    
    // Проверяем, есть ли товары с превышающим максимум количеством
    const validatedItems = data.map(item => {
      if (item.quantity > MAX_QUANTITY) {
        hasQuantityIssues = true;
        return { ...item, quantity: MAX_QUANTITY };
      }
      return item;
    });
    
    // Устанавливаем предупреждение, если нашли проблемы с количеством
    if (hasQuantityIssues) {
      setQuantityWarning(`Некоторые товары в корзине имели количество больше ${MAX_QUANTITY}. Эти значения были уменьшены до максимально допустимого значения.`);
    } else {
      setQuantityWarning(null);
    }
    
    return validatedItems;
  };

  const fetchCartItems = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Если уже в оффлайн режиме, загружаем из localStorage
      if (isOfflineMode) {
        const localCart = getLocalCart();
        setCartItems(localCart);
        setLoading(false);
        return;
      }
      
      // Добавляем случайный параметр к запросу, чтобы избежать кэширования
      const cacheBuster = new Date().getTime();
      
      try {
        const data = await safeFetch(`${baseApiUrl}/cart/?_=${cacheBuster}`);
        
        // Валидируем полученные данные
        if (!Array.isArray(data)) {
          throw new Error('Неверный формат данных от сервера');
        }
        
        // Проверяем и исправляем количество товаров, если оно больше максимального
        const validatedData = validateCartData(data);
        
        setCartItems(validatedData);
        
        // Сохраняем локальную копию для оффлайн режима
        saveLocalCart(validatedData);
        
        // Сбрасываем оффлайн режим, если запрос успешен
        setIsOfflineMode(false);
      } catch (fetchError: any) {
        // Если ошибка связана с превышением максимального количества
        if (fetchError.message && fetchError.message.includes('Input should be less than or equal to 99')) {
          // Загружаем локальную копию, если она есть
          const localCart = getLocalCart();
          if (localCart.length > 0) {
            setCartItems(localCart);
            setQuantityWarning(`Некоторые товары в корзине имеют количество больше ${MAX_QUANTITY}. Пожалуйста, уменьшите количество или удалите эти товары.`);
          } else {
            // Если локальной копии нет, показываем пустую корзину
            setCartItems([]);
            setError('Ошибка при загрузке корзины: превышено максимальное количество товаров.');
          }
        } else {
          throw fetchError; // Прокидываем ошибку дальше для обработки
        }
      }
    } catch (error: any) {
      console.error('Ошибка при загрузке корзины:', error);
      setError(`Не удалось загрузить корзину: ${error.message}`);
      
      // Если в оффлайн режиме или произошла ошибка, используем локальную копию
      if (isOfflineMode || error.message.includes('CORS') || error.message.includes('недоступен')) {
        const localCart = getLocalCart();
        setCartItems(localCart);
      } else {
        setCartItems([]); // Устанавливаем пустой массив, если нет локальных данных
      }
    } finally {
      setLoading(false);
    }
  };

  // Обработчик проверки подключения к серверу
  const checkServerConnection = async () => {
    try {
      // Пытаемся получить доступ к серверу через GET запрос на маршрут, который должен быть точно доступен
      await fetch(`${baseApiUrl}/products/categories/`, { 
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      // Если запрос успешен, сбрасываем оффлайн режим
      if (isOfflineMode) {
        setIsOfflineMode(false);
        setError(null);
        await fetchCartItems(); // Обновляем данные с сервера
      }
    } catch (error) {
      // Если сервер недоступен, переходим в оффлайн режим
      if (!isOfflineMode) {
        setIsOfflineMode(true);
        setError('Сервер недоступен. Работа в оффлайн режиме с локальными данными.');
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    const loadCart = async () => {
      try {
        if (isMounted) await fetchCartItems();
      } catch (error) {
        if (isMounted && retryCount < maxRetries) {
          retryCount++;
          console.log(`Попытка загрузки корзины ${retryCount} из ${maxRetries}...`);
          setTimeout(loadCart, 1500 * retryCount); // Увеличиваем интервал с каждой попыткой
        }
      }
    };

    loadCart();

    // Добавляем периодическую проверку подключения к серверу 
    // только если не в оффлайн режиме, чтобы не создавать лишнюю нагрузку
    let connectionCheckInterval: NodeJS.Timeout | null = null;
    if (!isOfflineMode) {
      connectionCheckInterval = setInterval(checkServerConnection, 30000); // Каждые 30 секунд
    }

    return () => {
      isMounted = false;
      if (connectionCheckInterval) clearInterval(connectionCheckInterval);
    };
  }, [isOfflineMode, baseApiUrl]);

  const syncWithServer = async (updatedCartItems: CartItem[]) => {
    // Сохраняем локальную копию даже при ошибках синхронизации
    saveLocalCart(updatedCartItems);
    
    // В оффлайн режиме только обновляем локальное хранилище
    if (isOfflineMode) {
      return;
    }
    
    // Здесь может быть логика синхронизации с сервером
    // Это более сложная логика, которая должна учитывать возможность потери соединения
  };

  const handleQuantityChange = useDebounce(async (itemId: number, newQuantity: number) => {
    // Проверка на допустимые значения
    if (newQuantity < 1) {
      setError('Количество товара не может быть меньше 1');
      return;
    }
    
    if (newQuantity > MAX_QUANTITY) {
      setError(`Максимальное количество товара - ${MAX_QUANTITY}`);
      // Ограничиваем значение максимальным разрешенным
      newQuantity = MAX_QUANTITY;
    }
    
    try {
      // Сброс ошибки при валидных данных
      setError(null);
      
      // Устанавливаем флаг обновления
      setIsUpdating(itemId);
      
      // Оптимистичное обновление UI
      const updatedCartItems = cartItems.map(item => 
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      );
      
      setCartItems(updatedCartItems);
      
      // Сохраняем локально в любом случае
      saveLocalCart(updatedCartItems);
      
      // Если в оффлайн режиме, не отправляем запрос на сервер
      if (isOfflineMode) {
        setTimeout(() => setIsUpdating(null), 300); // Имитируем задержку
        return;
      }
      
      // Отправляем запрос на сервер
      try {
        await safeFetch(`${baseApiUrl}/cart/${itemId}?quantity=${newQuantity}`, {
          method: 'PUT',
        });
        
        // Обновляем счетчик корзины
        updateCartCount();
      } catch (error: any) {
        console.error('Ошибка при обновлении количества:', error);
        // Если ошибка CORS или сервер недоступен, переходим в оффлайн режим
        if (error.message.includes('CORS') || error.message.includes('недоступен')) {
          setIsOfflineMode(true);
          setError('Сервер недоступен. Изменения сохранены локально.');
        } else {
          setError(`Не удалось обновить количество: ${error.message}`);
        }
      }
    } finally {
      setIsUpdating(null);
    }
  }, 300);

  const handleRemoveItem = async (itemId: number) => {
    try {
      // Сохраняем удаляемый товар для возможного восстановления
      const removedItem = cartItems.find(item => item.id === itemId);
      
      // Флаг обновления
      setIsUpdating(itemId);
      
      // Оптимистичное обновление UI
      const updatedCartItems = cartItems.filter(item => item.id !== itemId);
      setCartItems(updatedCartItems);
      
      // Сохраняем локально в любом случае
      saveLocalCart(updatedCartItems);
      
      // Если в оффлайн режиме, не отправляем запрос на сервер
      if (isOfflineMode) {
        setTimeout(() => setIsUpdating(null), 300); // Имитируем задержку
        return;
      }
      
      // Отправляем запрос на сервер
      try {
        await safeFetch(`${baseApiUrl}/cart/${itemId}`, {
          method: 'DELETE',
        });
        
        // Обновляем счетчик
        updateCartCount();
      } catch (error: any) {
        console.error('Ошибка при удалении товара:', error);
        // Если ошибка CORS или сервер недоступен, переходим в оффлайн режим
        if (error.message.includes('CORS') || error.message.includes('недоступен')) {
          setIsOfflineMode(true);
          setError('Сервер недоступен. Изменения сохранены локально.');
        } else {
          setError(`Не удалось удалить товар: ${error.message}`);
          // В случае других ошибок восстанавливаем товар в UI
          if (removedItem) {
            setCartItems(prev => [...prev, removedItem]);
          }
        }
      }
    } finally {
      setIsUpdating(null);
    }
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      setError('Ваша корзина пуста');
      return;
    }
    
    // В оффлайн режиме сохраняем заказ локально и показываем уведомление
    if (isOfflineMode) {
      setError('Оформление заказа недоступно в оффлайн режиме. Ваша корзина сохранена локально и будет отправлена, как только сервер станет доступен.');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      await safeFetch(`${baseApiUrl}/orders/`, {
        method: 'POST',
      });
      
      // Обновляем корзину и счетчик
      await fetchCartItems();
      updateCartCount();
      
      alert('Заказ успешно оформлен!');
      navigate('/');
    } catch (error: any) {
      console.error('Ошибка при оформлении заказа:', error);
      // Если ошибка CORS или сервер недоступен, переходим в оффлайн режим
      if (error.message.includes('CORS') || error.message.includes('недоступен')) {
        setIsOfflineMode(true);
        setError('Сервер недоступен. Ваш заказ сохранен локально и будет отправлен позже.');
      } else {
        setError(`Не удалось оформить заказ: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Функция для безопасного форматирования цены
  const formatPrice = (price: number): string => {
    if (typeof price !== 'number' || isNaN(price)) {
      return '0 ₽';
    }
    
    // Если цена целое число, возвращаем без десятичной части
    if (Number.isInteger(price)) {
      return `${price.toLocaleString('ru-RU')} ₽`;
    }
    // Иначе округляем до 2 знаков после запятой
    return `${price.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
  };

  // Вычисляем общую стоимость корзины с проверками на валидность
  const totalPrice = cartItems.reduce((sum, item) => {
    const price = item.product?.price || 0;
    // Проверяем и ограничиваем количество
    const quantity = Math.min(Math.max(1, item.quantity || 1), MAX_QUANTITY);
    return sum + price * quantity;
  }, 0);

  if (loading && cartItems.length === 0) {
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
  
  // Показываем предупреждение о превышении максимального количества
  const showQuantityWarning = quantityWarning && (
    <div className="warning-container">
      <div className="warning">{quantityWarning}</div>
    </div>
  );

  // Показываем уведомление об оффлайн режиме
  const showOfflineMode = isOfflineMode && (
    <div className="offline-mode-alert">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
        <line x1="12" y1="20" x2="12.01" y2="20"></line>
      </svg>
      <p>Вы работаете в оффлайн режиме. Изменения будут сохранены локально.</p>
      <button onClick={checkServerConnection} className="retry-button">
        Повторить подключение
      </button>
    </div>
  );

  if (cartItems.length === 0) {
    return (
      <div className="cart-container">
        {showOfflineMode}
        {showError}
        {showQuantityWarning}
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
      
      {showOfflineMode}
      {showError}
      {showQuantityWarning}
      
      <div className="cart-items">
        {cartItems.map((item) => (
          <div 
            key={item.id} 
            className={`cart-item ${isUpdating === item.id ? 'updating' : ''}`}
            style={{...cartItemTransition}}>
            {item.product?.image_url && (
              <div className="item-image">
                <img 
                  src={item.product.image_url} 
                  alt={item.product?.name || 'Товар'} 
                  onError={(e) => {
                    // Устанавливаем запасное изображение при ошибке загрузки
                    (e.target as HTMLImageElement).src = '/images/products/default-category.jpg';
                  }}
                />
              </div>
            )}
            
            <div className="item-details">
              <h3>{item.product?.name || 'Товар'}</h3>
              {item.product?.weight && <p className="item-weight">Вес: {item.product.weight}</p>}
              <p className="item-price">{formatPrice(item.product?.price || 0)}</p>
              {item.product?.description && (
                <p className="item-description">{item.product.description.substring(0, 60)}...</p>
              )}
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
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={MAX_DIGITS} // Ограничиваем количество символов!
                value={item.quantity}
                onChange={(e) => {
                  if (isUpdating === item.id) return;
                  
                  // Очищаем все нецифровые символы
                  const newValue = e.target.value.replace(/[^0-9]/g, '');
                  
                  // Проверяем, не пустая ли строка
                  if (newValue === '') {
                    setCartItems(prevItems => 
                      prevItems.map(cartItem => 
                        cartItem.id === item.id ? { ...cartItem, quantity: 1 } : cartItem
                      )
                    );
                    return;
                  }
                  
                  // Преобразуем в число с проверкой на максимальное значение
                  const newQuantity = Math.min(parseInt(newValue, 10) || 1, MAX_QUANTITY);
                  
                  // Обновляем UI
                  setCartItems(prevItems => 
                    prevItems.map(cartItem => 
                      cartItem.id === item.id ? { ...cartItem, quantity: newQuantity } : cartItem
                    )
                  );
                  
                  // Отправляем на сервер если значение изменилось
                  if (newQuantity !== item.quantity) {
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
              <p>{formatPrice((item.product?.price || 0) * (item.quantity || 1))}</p>
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
            disabled={loading || cartItems.length === 0}
          >
            {loading ? 'Оформление...' : 'Оформить заказ'}
          </button>
          
          <button 
            onClick={() => navigate('/products')} 
            className="continue-shopping"
          >
            Продолжить покупки
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;