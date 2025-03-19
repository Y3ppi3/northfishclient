from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from database import get_db
from models import Cart, Product, User
from schemas import CartItemCreate, CartItemResponse
from typing import List

router = APIRouter(prefix="/cart", tags=["Cart"])

# Константа для максимального количества товара
MAX_QUANTITY = 99

@router.post("/", response_model=CartItemResponse)
def add_to_cart(
    cart_item: CartItemCreate, 
    db: Session = Depends(get_db)
):
    """
    Добавление товара в корзину.
    - Если товар уже есть в корзине, увеличивает количество
    - Если товара нет, создает новую запись
    """
    # Проверка на максимальное количество
    if cart_item.quantity > MAX_QUANTITY:
        raise HTTPException(
            status_code=400, 
            detail=f"Количество товара не может превышать {MAX_QUANTITY}"
        )
        
    # Проверяем существование продукта
    product = db.query(Product).filter(Product.id == cart_item.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")

    # Жестко прописанный ID пользователя (TODO: заменить на авторизованного)
    user_id = 1

    # Ищем существующий товар в корзине
    existing_item = db.query(Cart).filter(
        and_(
            Cart.user_id == user_id, 
            Cart.product_id == cart_item.product_id
        )
    ).first()

    if existing_item:
        # Проверка на максимальное количество с учетом уже имеющегося товара
        new_quantity = existing_item.quantity + cart_item.quantity
        if new_quantity > MAX_QUANTITY:
            raise HTTPException(
                status_code=400, 
                detail=f"Общее количество товара не может превышать {MAX_QUANTITY}"
            )
            
        # Обновляем количество существующего товара
        existing_item.quantity = new_quantity
        db.commit()
        db.refresh(existing_item)
        return existing_item
    else:
        # Создаем новую запись в корзине
        new_cart_item = Cart(
            user_id=user_id, 
            product_id=cart_item.product_id, 
            quantity=cart_item.quantity
        )
        db.add(new_cart_item)
        db.commit()
        db.refresh(new_cart_item)
        return new_cart_item

@router.get("/", response_model=List[CartItemResponse])
def get_cart(db: Session = Depends(get_db)):
    """
    Получение всех товаров в корзине с подробной информацией о продукте.
    """
    # Жестко прописанный ID пользователя (TODO: заменить на авторизованного)
    user_id = 1

    # Используем joinedload для эффективной загрузки связанных данных о продукте
    cart_items = (
        db.query(Cart)
        .options(joinedload(Cart.product))
        .filter(Cart.user_id == user_id)
        .all()
    )
    return cart_items

@router.put("/{cart_id}", response_model=CartItemResponse)
def update_cart_quantity(
    cart_id: int, 
    quantity: int, 
    db: Session = Depends(get_db)
):
    """
    Обновление количества товара в корзине.
    """
    # Валидация количества
    if quantity < 1:
        raise HTTPException(
            status_code=400, 
            detail="Количество товара должно быть не менее 1"
        )
    
    if quantity > MAX_QUANTITY:
        raise HTTPException(
            status_code=400, 
            detail=f"Количество товара не может превышать {MAX_QUANTITY}"
        )
        
    # Жестко прописанный ID пользователя (TODO: заменить на авторизованного)
    user_id = 1

    # Находим элемент корзины с проверкой принадлежности пользователю
    cart_item = (
        db.query(Cart)
        .filter(
            and_(
                Cart.id == cart_id, 
                Cart.user_id == user_id
            )
        )
        .first()
    )

    if not cart_item:
        raise HTTPException(status_code=404, detail="Товар в корзине не найден")
    
    # Обновляем количество
    cart_item.quantity = quantity
    db.commit()
    db.refresh(cart_item)
    return cart_item

@router.delete("/{cart_id}")
def remove_from_cart(cart_id: int, db: Session = Depends(get_db)):
    """
    Удаление товара из корзины.
    """
    # Жестко прописанный ID пользователя (TODO: заменить на авторизованного)
    user_id = 1

    # Находим элемент корзины с проверкой принадлежности пользователю
    cart_item = (
        db.query(Cart)
        .filter(
            and_(
                Cart.id == cart_id, 
                Cart.user_id == user_id
            )
        )
        .first()
    )

    if not cart_item:
        raise HTTPException(status_code=404, detail="Товар в корзине не найден")

    # Удаляем товар
    db.delete(cart_item)
    db.commit()
    return {"message": "Товар удален из корзины"}

@router.get("/count", response_model=int)
def get_cart_count(db: Session = Depends(get_db)):
    """
    Получение количества товаров в корзине.
    """
    # Жестко прописанный ID пользователя (TODO: заменить на авторизованного)
    user_id = 1

    # Считаем общее количество товаров в корзине
    cart_count = (
        db.query(Cart)
        .filter(Cart.user_id == user_id)
        .count()
    )
    return cart_count