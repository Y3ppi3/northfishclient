from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, func, Date
from sqlalchemy.orm import relationship
from database import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)
    price = Column(Float)
    image_url = Column(String)
    
    # Добавляем поле weight
    weight = Column(String)  # Тип String, так как вес может быть записан как строка (например, "1 кг")

    # Добавляем внешний ключ для категории
    category_id = Column(Integer, ForeignKey("categories.id"))
    
    # Связь с категорией
    category = relationship("Category", back_populates="products")

# Модель пользователя с обновленными полями
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    email = Column(String, unique=True, index=True) 
    phone = Column(String, unique=True, index=True)
    full_name = Column(String)
    # Добавляем поле для даты рождения
    birthday = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())

    cart = relationship("Cart", back_populates="user")
    orders = relationship("Order", back_populates="user")

class Cart(Base):
    __tablename__ = "cart"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, default=1)

    user = relationship("User", back_populates="cart")
    product = relationship("Product")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    total_price = Column(Float, nullable=False)
    status = Column(String, default="pending")  # pending, completed, cancelled
    created_at = Column(DateTime, default=func.now())

    user = relationship("User", back_populates="orders")

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    slug = Column(String, unique=True, index=True)

    # Связь с продуктами
    products = relationship("Product", back_populates="category")