import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        navigate(result.role === 'admin' ? '/admin' : '/config');
      } else {
        setError(result.error || '登录失败');
      }
    } catch {
      setError('登录出错，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <span className="login-icon">💰</span>
          <h1>金银价实时通</h1>
          <p>管理后台登录</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入邮箱"
              required
            />
          </div>

          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="login-hint">
          <p>测试账号：</p>
          <p>管理员：admin@gold.com / admin123</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
