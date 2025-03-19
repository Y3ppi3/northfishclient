from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db  
from models import Order, Cart, User  
from schemas import OrderCreate, OrderResponse  
from typing import List

router = APIRouter(prefix="/orders", tags=["Orders"])

@router.post("/", response_model=OrderResponse)
def create_order(db: Session = Depends(get_db)):
    cart_items = db.query(Cart).all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    total_price = sum(item.product.price * item.quantity for item in cart_items)

    order = Order(user_id=1, total_price=total_price)  # TODO: заменить user_id на текущего пользователя
    db.add(order)
    db.commit()
    db.refresh(order)

    # Очистить корзину после заказа
    db.query(Cart).delete()
    db.commit()

    return order

@router.get("/", response_model=List[OrderResponse])
def get_orders(db: Session = Depends(get_db)):
    return db.query(Order).all()