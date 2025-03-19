import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

const ProductDetail = ({ updateCartCount }) => {
  const { id } = useParams();
  const [product, setProduct] = useState(null);

  useEffect(() => {
    const fetchProduct = async () => {
      const res = await axios.get(`http://127.0.0.1:8000/products/${id}`);
      setProduct(res.data);
    };

    fetchProduct();
  }, [id]);

  const addToCart = async () => {
    try {
      await axios.post("http://127.0.0.1:8000/cart/", {
        product_id: id,
        quantity: 1,
      });
      updateCartCount(); // Обновляем счетчик корзины
    } catch (error) {
      console.error('Ошибка добавления в корзину:', error);
    }
  };

  if (!product) return <div className="text-center mt-20 text-gray-600">Загрузка...</div>;

  return (
    <div className="max-w-4xl mx-auto my-12 bg-white rounded-xl shadow-xl p-8">
      <img src={product.image_url || "/placeholder.jpg"} alt={product.name} className="rounded-lg w-full h-80 object-cover mb-6"/>
      <h1 className="text-3xl font-bold text-gray-800">{product.name}</h1>
      <p className="text-xl text-blue-600 font-bold my-4">{product.price} ₽</p>
      <p className="text-gray-700 text-lg">{product.description || "Описание отсутствует."}</p>
      <button 
        className="mt-6 bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition"
        onClick={addToCart}
      >
        Добавить в корзину
      </button>
    </div>
  );
};

export default ProductDetail;