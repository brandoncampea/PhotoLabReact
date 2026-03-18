import { useState } from 'react';
import '../PhotoLabStyles.css';

type SuperAdminLoginProps = { onLogin: (email: string, password: string) => void };
const SuperAdminLogin: React.FC<SuperAdminLoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onLogin && onLogin(email, password);
  };
  return (
    <div className="admin-login-container">
      <h1>Super Admin Login</h1>
      <form className="admin-login-form" onSubmit={handleSubmit}>
        <label htmlFor="superadmin-email">Email</label>
        <input
          id="superadmin-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <label htmlFor="superadmin-password">Password</label>
        <input
          id="superadmin-password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button type="submit">Sign In</button>
      </form>
    </div>
  );
};

export default SuperAdminLogin;
