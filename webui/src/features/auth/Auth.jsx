import React, { useState } from 'react';
import { supabase } from '../../api/supabase';
import styles from './Auth.module.css';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage('登录失败: ' + error.message);
    setLoading(false);
  };

  return (
    <section className={styles.container}>
      <div className={styles.authBox}>
        <h1 className={styles.title}>AuraFlow v2 登录</h1>
        <form onSubmit={handleLogin} className={styles.form}>
          <input id="email" type="email" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input id="password" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button disabled={loading} className={styles.button}>
            {loading ? '登录中...' : '登录'}
          </button>
          <p className={styles.message}>{message}</p>
        </form>
      </div>
    </section>
  );
}