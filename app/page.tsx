'use client';
import { io } from 'socket.io-client'; 
import { useState, useEffect, useRef } from 'react';

// --- ICONS (SVG) ---
const EyeIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);
const EyeOffIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M1 1l22 22M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/></svg>
);
const SunIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
);
const MoonIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
);
const CloseIcon = () => (
  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
);
const LockIcon = () => (
   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
);

export default function JulianPanel() {
  // --- STATE VIEW ---
  const [currentView, setCurrentView] = useState('landing');
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');

  // --- FORM DATA ---
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    loginIdentifier: '', 
    loginPassword: '',
    resetEmail: '',
    newPassword: '',
    pin: '',
    waNumber: ''
  });

  // --- UI TOGGLES ---
  const [showRegPass, setShowRegPass] = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showResetPass, setShowResetPass] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // --- SYSTEM ---
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: '', type: 'info' });
  const [registeredUser, setRegisteredUser] = useState<any>(null);
  
  // Login Attempts Counter
  const [loginAttempts, setLoginAttempts] = useState(0);

  // --- DASHBOARD STATE ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [botStatus, setBotStatus] = useState('IDLE'); // IDLE, PAIRING, WAITING_SCAN, CONNECTED
  const [pairingCode, setPairingCode] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null); // Ref untuk Socket
  
  // STATS
  const [expiryTime, setExpiryTime] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState('-- : -- : --');

  // CONFIG
  const VALID_PIN = "JP2026";
  const ADMIN_WA = "6283854921907";

  // --- THEME ---
  const themes = {
    dark: {
      bg: '#0f172a', text: '#f8fafc', textSub: '#94a3b8',
      glass: 'rgba(30, 41, 59, 0.7)', glassBorder: 'rgba(255, 255, 255, 0.1)',
      inputBg: 'rgba(15, 23, 42, 0.6)', inputBorder: 'rgba(255, 255, 255, 0.1)',
      sidebarBg: '#020617', accent: '#6366f1'
    },
    light: {
      bg: '#f1f5f9', text: '#0f172a', textSub: '#64748b',
      glass: 'rgba(255, 255, 255, 0.9)', glassBorder: 'rgba(0, 0, 0, 0.1)',
      inputBg: '#ffffff', inputBorder: '#cbd5e1',
      sidebarBg: '#ffffff', accent: '#3b82f6'
    }
  };
  const currentTheme = themes[themeMode];

  // --- EFFECTS ---

  // 1. CEK SESI LOGIN SAAT WEB DIBUKA
  useEffect(() => {
    // Ambil data sesi dari LocalStorage
    const sessionStr = localStorage.getItem('jp_session');
    if (sessionStr) {
        try {
            const user = JSON.parse(sessionStr);
            setRegisteredUser(user);
            // Jika ada sesi, langsung masuk dashboard (skip login & pin)
            setCurrentView('dashboard');
            if("Notification" in window && Notification.permission !== "granted") {
                Notification.requestPermission();
            }
        } catch (e) {
            console.error("Session Error", e);
            localStorage.removeItem('jp_session');
        }
    }
  }, []);
  
  // 2. Socket.IO Connection Logic (SUDAH DIPERBAIKI KE SERVER)
  useEffect(() => {
    if (currentView === 'dashboard') {
        // --- KONEKSI KE SERVER PTERODACTYL ---
        const SERVER_URL = undefined;
        
        console.log(`Menghubungkan via Proxy...`);
        
        socketRef.current = io({
            path: '/socket.io', // Wajib ada agar proxy next.config.ts jalan
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
        });

        // Listener: Terima Log dari Server
        socketRef.current.on('log', (msg: string) => {
            addLog(msg);
        });

        // Listener: Terima Pairing Code Asli
        socketRef.current.on('pairing_code', (code: string) => {
            setPairingCode(code);
            setBotStatus('WAITING_SCAN');
            
            // Set Timer Expired (Visual)
            const date = new Date(); 
            date.setDate(date.getDate() + 30); 
            setExpiryTime(date.getTime());
        });

        // Listener: Status Koneksi Sukses
        socketRef.current.on('connect', () => {
             console.log("✅ BERHASIL TERHUBUNG!");
             addLog("✅ Terhubung ke Server Utama.");
        });

        socketRef.current.on('connect_error', (err: any) => {
             console.error("❌ Gagal Konek:", err);
        });

        socketRef.current.on('status', (status: string) => {
            if(status === 'CONNECTED') {
                setBotStatus('CONNECTED');
                showToast('Bot Berhasil Terhubung!', 'success');
            } else if (status === 'DISCONNECTED') {
                setBotStatus('IDLE');
                setPairingCode('');
            }
        });

        // Cleanup saat keluar dashboard
        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }
  }, [currentView]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!expiryTime) return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = expiryTime - now;
      if (distance < 0) {
        clearInterval(interval);
        setTimeLeft("EXPIRED");
        setBotStatus("IDLE");
      } else {
        const d = Math.floor(distance / (1000 * 60 * 60 * 24));
        const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeLeft(`${d}h ${h}j ${m}m ${s}d`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiryTime]);

  // --- FUNCTIONS ---
  const showToast = (msg: string, type = 'info') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'info' }), 3000);
  };

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('id-ID', {hour12:false});
    setLogs(prev => [`[${time}] ${msg}`, ...prev]);
  };

  // --- LOGIKA REGISTER (DENGAN LOCALSTORAGE) ---
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, password } = formData;
    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*[0-9]).{6,}$/;
    if (!name || !email || !password) return showToast('Isi semua data!', 'error');
    if (!passwordRegex.test(password)) return showToast('Password min 6 (Huruf & Angka)', 'error');

    setIsLoading(true);
    setTimeout(() => {
      // 1. Ambil data user lama dari Storage
      const existingUsersStr = localStorage.getItem('jp_users');
      const existingUsers = existingUsersStr ? JSON.parse(existingUsersStr) : [];

      // 2. Cek apakah email sudah dipakai
      const isEmailTaken = existingUsers.some((u: any) => u.email === email);
      if (isEmailTaken) {
          setIsLoading(false);
          return showToast('Email sudah terdaftar! Silakan login.', 'error');
      }

      // 3. Simpan User Baru
      const newUser = { name, email, password };
      existingUsers.push(newUser);
      localStorage.setItem('jp_users', JSON.stringify(existingUsers));

      setRegisteredUser(newUser);
      setIsLoading(false);
      showToast('Akun berhasil dibuat!', 'success');
      
      // Auto-fill email untuk login
      setFormData(prev => ({...prev, loginIdentifier: email, name: ''}));
      setCurrentView('login');
    }, 1500);
  };

  // --- LOGIKA LOGIN (DENGAN LOCALSTORAGE) ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      let loggedUser = null;

      // 1. Cek Admin Default
      if (formData.loginIdentifier === 'admin' && formData.loginPassword === 'admin') {
          loggedUser = { name: 'Super Admin', email: 'admin', password: 'admin' };
      } else {
          // 2. Cek User di LocalStorage
          const existingUsersStr = localStorage.getItem('jp_users');
          const existingUsers = existingUsersStr ? JSON.parse(existingUsersStr) : [];
          
          loggedUser = existingUsers.find((u: any) => 
            u.email === formData.loginIdentifier && u.password === formData.loginPassword
          );
      }

      if (loggedUser) {
        setIsLoading(false);
        setLoginAttempts(0);
        setRegisteredUser(loggedUser);
        
        // Simpan Sesi Login
        localStorage.setItem('jp_session', JSON.stringify(loggedUser));

        showToast(`Selamat datang, ${loggedUser.name}!`, 'success');
        setCurrentView('pin'); // Lanjut ke PIN Check
        
        if("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }

      } else {
        const attempts = loginAttempts + 1;
        setLoginAttempts(attempts);
        setIsLoading(false);

        if (attempts >= 3) {
           showToast('Terlalu banyak percobaan! Mengulang ke awal.', 'error');
           setLoginAttempts(0);
           setFormData(prev => ({...prev, loginPassword: ''}));
           setCurrentView('landing'); 
        } else {
           showToast(`Email/Password Salah! (Percobaan ${attempts}/3)`, 'error');
        }
      }
    }, 1500);
  };

  // --- LOGIKA RESET PASSWORD (DENGAN LOCALSTORAGE) ---
  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    setTimeout(() => {
      const existingUsersStr = localStorage.getItem('jp_users');
      const existingUsers = existingUsersStr ? JSON.parse(existingUsersStr) : [];
      
      // Cari index user
      const userIndex = existingUsers.findIndex((u: any) => u.email === formData.resetEmail);

      if (userIndex !== -1) {
         // Update password user tsb
         existingUsers[userIndex].password = formData.newPassword;
         localStorage.setItem('jp_users', JSON.stringify(existingUsers));

         setIsLoading(false);
         showToast('Password berhasil diubah! Silakan login.', 'success');
         setCurrentView('login');
         setFormData(prev => ({...prev, loginPassword: '', newPassword: '', resetEmail: ''}));
      } else if (formData.resetEmail === 'admin') {
         setIsLoading(false);
         showToast('Akun Admin tidak bisa di-reset.', 'error');
      } else {
         setIsLoading(false);
         showToast('Email tidak terdaftar.', 'error');
      }
    }, 1500);
  };

  const handlePin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      if (formData.pin === VALID_PIN) {
        setIsLoading(false);
        showToast('Akses Diterima', 'success');
        setCurrentView('dashboard');
      } else {
        setIsLoading(false);
        showToast('PIN Salah', 'error');
      }
    }, 1200);
  };

  const handleStartBot = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.waNumber.length < 10) return showToast('Nomor WA tidak valid', 'error');
    
    setBotStatus('PAIRING');
    setLogs([]); // Reset log lama
    addLog('Mengirim permintaan ke Server...');

    if (socketRef.current) {
        socketRef.current.emit('start_bot', { phoneNumber: formData.waNumber });
    } else {
        addLog('Error: Socket tidak terhubung ke server backend.');
        showToast('Gagal koneksi server backend', 'error');
    }
  };

  const handleStopBot = () => {
    if (confirm('⚠️ PERINGATAN: Apakah Anda yakin ingin mematikan bot dan menghapus sesi? Perangkat tertaut akan dicabut.')) {
        if(socketRef.current) {
            socketRef.current.emit('stop_bot');
            setBotStatus('IDLE');
        }
    }
  };

  // --- LOGIKA LOGOUT ---
  const handleLogout = () => {
      // Hapus Sesi
      localStorage.removeItem('jp_session');
      
      // Reset State
      setRegisteredUser(null);
      setCurrentView('landing');
      setFormData({...formData, waNumber:'', pin:'', loginPassword: ''});
      setBotStatus('IDLE');
      setExpiryTime(null);
      
      if (socketRef.current) socketRef.current.disconnect(); 
  };

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; overflow-x: hidden; background: ${currentTheme.bg}; color: ${currentTheme.text}; transition: background 0.3s, color 0.3s; }
        .glass { background: ${currentTheme.glass}; backdrop-filter: blur(12px); border: 1px solid ${currentTheme.glassBorder}; box-shadow: 0 4px 20px rgba(0,0,0,0.1); transition: 0.3s; }
        .input-wrapper { position: relative; margin-bottom: 15px; }
        label { display: block; font-size: 13px; font-weight: 600; color: ${currentTheme.textSub}; margin-bottom: 6px; }
        input { width: 100%; padding: 14px; padding-right: 45px; border-radius: 8px; border: 1px solid ${currentTheme.inputBorder}; background: ${currentTheme.inputBg}; color: ${currentTheme.text}; font-size: 14px; outline: none; transition: 0.2s; box-sizing: border-box; }
        input:focus { border-color: ${currentTheme.accent}; }
        .pass-toggle { position: absolute; right: 10px; top: 38px; cursor: pointer; color: ${currentTheme.textSub}; background: none; border: none; }
        .btn-primary { width: 100%; padding: 14px; border-radius: 8px; border: none; font-weight: 600; font-size: 14px; background: ${currentTheme.accent}; color: #fff; cursor: pointer; transition: 0.2s; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-outline { width: 100%; padding: 14px; border-radius: 8px; border: 1px solid ${currentTheme.glassBorder}; background: transparent; color: ${currentTheme.textSub}; font-weight: 600; cursor: pointer; transition: 0.2s; }
        .btn-outline:hover { border-color: ${currentTheme.textSub}; color: ${currentTheme.text}; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .sidebar { width: 260px; height: 100vh; position: fixed; left: 0; top: 0; background: ${currentTheme.sidebarBg}; border-right: 1px solid ${currentTheme.glassBorder}; z-index: 50; transition: 0.3s; }
        .main { margin-left: 260px; min-height: 100vh; transition: 0.3s; }
        .close-sidebar-btn { display: none; }
        @media (max-width: 768px) { 
          .sidebar { transform: translateX(-100%); width: 80%; max-width: 300px; box-shadow: 5px 0 25px rgba(0,0,0,0.5); } 
          .sidebar.active { transform: translateX(0); } .main { margin-left: 0; } .mobile-overlay.active { display: block; } .hide-mobile { display: none; } 
          .close-sidebar-btn { display: block; background: none; border: none; color: ${currentTheme.text}; cursor: pointer; padding: 5px; }
        }
        .toast { position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 8px; z-index: 200; font-size: 13px; font-weight: 600; color: #fff; }
        .toast.error { background: #ef4444; } .toast.success { background: #10b981; } .toast.info { background: #3b82f6; }
        .link-text { font-size: 13px; color: ${currentTheme.accent}; cursor: pointer; text-decoration: none; font-weight: 600; margin-top: 10px; display: inline-block; }
        .link-text:hover { text-decoration: underline; }
      `}</style>

      {toast.show && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* PROFILE MODAL */}
      {showProfileModal && (
        <div className="modal-overlay" onClick={(e) => {if(e.target === e.currentTarget) setShowProfileModal(false)}}>
          <div className="glass" style={{width:'90%', maxWidth:'350px', borderRadius:'16px', padding:'25px'}}>
            <div style={{textAlign:'center', marginBottom:'20px'}}>
              <div style={{width:'60px', height:'60px', borderRadius:'50%', background: currentTheme.accent, margin:'0 auto 10px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px', color:'#fff'}}>👤</div>
              <h3 style={{margin:0, color: currentTheme.text}}>{registeredUser ? registeredUser.name : 'Administrator'}</h3>
            </div>
            <div style={{background: themeMode==='dark'?'rgba(0,0,0,0.2)':'#f1f5f9', padding:'15px', borderRadius:'10px', fontSize:'13px', display:'flex', flexDirection:'column', gap:'12px'}}>
              <div style={{display:'flex', justifyContent:'space-between'}}><span style={{color: currentTheme.textSub}}>Email</span><span style={{fontWeight:'600'}}>{registeredUser ? registeredUser.email : 'admin'}</span></div>
              <div style={{display:'flex', justifyContent:'space-between'}}><span style={{color: currentTheme.textSub}}>Password</span><span style={{fontWeight:'600', fontFamily:'monospace'}}>{registeredUser ? registeredUser.password : 'admin123'}</span></div>
            </div>
            <button onClick={()=>setShowProfileModal(false)} style={{marginTop:'20px', padding:'10px', width:'100%', borderRadius:'8px', border:'none', background:'#ef4444', color:'#fff', fontWeight:'600', cursor:'pointer'}}>Tutup</button>
          </div>
        </div>
      )}

      {/* VIEW: LANDING */}
      {currentView === 'landing' && (
        <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}>
          <div className="glass" style={{padding:'40px', borderRadius:'20px', maxWidth:'400px', width:'100%', textAlign:'center'}}>
            <div style={{width:'64px', height:'64px', background: currentTheme.accent, borderRadius:'16px', margin:'0 auto 20px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'28px', color:'#fff', fontWeight:'bold'}}>JP</div>
            <h1 style={{fontSize:'24px', fontWeight:'700', margin:'0 0 8px 0'}}>JULIAN PANEL</h1>
            <p style={{color: currentTheme.textSub, fontSize:'14px', marginBottom:'30px'}}>Manajemen Bot WhatsApp Premium</p>
            <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
              <button onClick={()=>setCurrentView('login')} className="btn-primary">Masuk</button>
              <button onClick={()=>setCurrentView('register')} className="btn-outline">Daftar Akun</button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: REGISTER */}
      {currentView === 'register' && (
        <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}>
          <div className="glass" style={{padding:'40px', borderRadius:'20px', maxWidth:'400px', width:'100%'}}>
            <h2 style={{fontSize:'22px', margin:'0 0 5px 0'}}>Daftar Akun</h2>
            <p style={{fontSize:'13px', color: currentTheme.textSub, marginBottom:'25px'}}>Buat akun baru untuk memulai.</p>
            <form onSubmit={handleRegister}>
              <div className="input-wrapper"><label>NAMA</label><input type="text" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} /></div>
              <div className="input-wrapper"><label>EMAIL</label><input type="email" value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} /></div>
              <div className="input-wrapper">
                <label>PASSWORD</label>
                <input type={showRegPass ? "text" : "password"} value={formData.password} onChange={e=>setFormData({...formData, password: e.target.value})} />
                <button type="button" className="pass-toggle" onClick={()=>setShowRegPass(!showRegPass)}>{showRegPass ? <EyeOffIcon/> : <EyeIcon/>}</button>
              </div>
              <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? '...' : 'Daftar'}</button>
            </form>
            <div style={{textAlign:'center', marginTop:'20px', fontSize:'13px'}}>Sudah punya akun? <span onClick={()=>setCurrentView('login')} className="link-text" style={{marginTop:0}}>Masuk</span></div>
          </div>
        </div>
      )}

      {/* VIEW: LOGIN */}
      {currentView === 'login' && (
        <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}>
          <div className="glass" style={{padding:'40px', borderRadius:'20px', maxWidth:'400px', width:'100%'}}>
            <h2 style={{fontSize:'22px', margin:'0 0 5px 0'}}>Masuk Panel</h2>
            <p style={{fontSize:'13px', color: currentTheme.textSub, marginBottom:'25px'}}>Selamat datang kembali.</p>
            <form onSubmit={handleLogin}>
              <div className="input-wrapper"><label>EMAIL / USERNAME</label><input type="text" value={formData.loginIdentifier} onChange={e=>setFormData({...formData, loginIdentifier: e.target.value})} /></div>
              <div className="input-wrapper">
                <label>PASSWORD</label>
                <input type={showLoginPass ? "text" : "password"} value={formData.loginPassword} onChange={e=>setFormData({...formData, loginPassword: e.target.value})} />
                <button type="button" className="pass-toggle" onClick={()=>setShowLoginPass(!showLoginPass)}>{showLoginPass ? <EyeOffIcon/> : <EyeIcon/>}</button>
              </div>
              
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                 <div style={{fontSize:'12px', color: currentTheme.textSub}}>{loginAttempts > 0 ? `${loginAttempts}/3 Kesempatan` : ''}</div>
                 <div onClick={()=>setCurrentView('forgot-password')} style={{fontSize:'12px', color: currentTheme.accent, cursor:'pointer', fontWeight:'600'}}>Lupa Password?</div>
              </div>

              <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? '...' : 'Masuk'}</button>
            </form>
            <div style={{textAlign:'center', marginTop:'20px', fontSize:'13px', color: currentTheme.textSub}}>Belum punya akun? <span onClick={()=>setCurrentView('register')} className="link-text" style={{marginTop:0}}>Daftar</span></div>
          </div>
        </div>
      )}

      {/* VIEW: FORGOT PASSWORD */}
      {currentView === 'forgot-password' && (
        <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}>
          <div className="glass" style={{padding:'40px', borderRadius:'20px', maxWidth:'400px', width:'100%'}}>
            <div style={{textAlign:'center', marginBottom:'20px'}}>
               <div style={{color: currentTheme.accent, marginBottom:'10px'}}><LockIcon/></div>
               <h2 style={{fontSize:'20px', margin:'0 0 5px 0'}}>Reset Password</h2>
               <p style={{fontSize:'13px', color: currentTheme.textSub}}>Masukkan email Anda untuk reset.</p>
            </div>
            
            <form onSubmit={handleResetPassword}>
              <div className="input-wrapper">
                <label>EMAIL TERDAFTAR</label>
                <input type="email" placeholder="name@domain.com" value={formData.resetEmail} onChange={e=>setFormData({...formData, resetEmail: e.target.value})} />
              </div>
              <div className="input-wrapper">
                <label>PASSWORD BARU</label>
                <input type={showResetPass ? "text" : "password"} placeholder="Min. 6 Karakter" value={formData.newPassword} onChange={e=>setFormData({...formData, newPassword: e.target.value})} />
                <button type="button" className="pass-toggle" onClick={()=>setShowResetPass(!showResetPass)}>{showResetPass ? <EyeOffIcon/> : <EyeIcon/>}</button>
              </div>
              <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? 'Memproses...' : 'Ubah Password'}</button>
            </form>
            <div style={{textAlign:'center', marginTop:'20px'}}>
               <span onClick={()=>setCurrentView('login')} className="link-text">Kembali ke Login</span>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: PIN */}
      {currentView === 'pin' && (
        <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}>
          <div className="glass" style={{padding:'40px', borderRadius:'20px', maxWidth:'380px', width:'100%', textAlign:'center'}}>
            <h2 style={{fontSize:'20px', margin:'0 0 10px 0'}}>Verifikasi Lisensi</h2>
            <p style={{fontSize:'13px', color: currentTheme.textSub, marginBottom:'25px'}}>Hubungi Admin untuk PIN.</p>
            <form onSubmit={handlePin}>
              <div className="input-wrapper">
                <input type="text" placeholder="PIN CODE" value={formData.pin} onChange={e=>setFormData({...formData, pin: e.target.value})} style={{textAlign:'center', fontSize:'22px', letterSpacing:'5px', fontWeight:'700', fontFamily:'monospace'}} maxLength={8} />
              </div>
              <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? '...' : 'Verifikasi'}</button>
            </form>
            <div style={{marginTop:'25px'}}><a href={`https://wa.me/${ADMIN_WA}`} target="_blank" style={{color: currentTheme.accent, fontSize:'13px', fontWeight:'600', textDecoration:'none'}}>Minta PIN</a></div>
          </div>
        </div>
      )}

      {/* VIEW: DASHBOARD */}
      {currentView === 'dashboard' && (
        <>
          <div className={`mobile-overlay ${isSidebarOpen ? 'active' : ''}`} onClick={()=>setIsSidebarOpen(false)}></div>
          
          <div className={`sidebar ${isSidebarOpen ? 'active' : ''}`}>
             <div style={{padding:'20px', borderBottom:`1px solid ${currentTheme.glassBorder}`, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
               <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                  <div style={{width:'32px', height:'32px', background: currentTheme.accent, borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold', color:'#fff'}}>JP</div>
                  <div><div style={{fontWeight:'700', fontSize:'15px'}}>JULIAN</div><div style={{fontSize:'11px', color: currentTheme.textSub}}>Enterprise v9.0</div></div>
               </div>
               <button className="close-sidebar-btn" onClick={()=>setIsSidebarOpen(false)}><CloseIcon/></button>
             </div>

             <div style={{padding:'20px', display:'flex', flexDirection:'column', gap:'5px'}}>
               {['Dashboard', 'Settings', 'Logs'].map((item) => (
                 <div key={item} onClick={()=>{ setActiveTab(item.toLowerCase()); setIsSidebarOpen(false); }} 
                    style={{
                      padding:'12px 14px', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontWeight:'500',
                      background: activeTab === item.toLowerCase() ? currentTheme.glassBorder : 'transparent',
                      color: activeTab === item.toLowerCase() ? currentTheme.accent : currentTheme.textSub
                    }}>
                   {item}
                 </div>
               ))}
             </div>
             
             <div style={{marginTop:'auto', padding:'20px'}}>
               <div style={{background: currentTheme.glass, padding:'10px', borderRadius:'10px', border:`1px solid ${currentTheme.glassBorder}`, marginBottom:'15px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <span style={{fontSize:'12px', fontWeight:'600'}}>Tema:</span>
                  <div style={{display:'flex', gap:'5px'}}>
                    <button onClick={()=>setThemeMode('light')} style={{padding:'6px', border:'none', background:'transparent', color: themeMode==='light'?currentTheme.accent:currentTheme.textSub, cursor:'pointer'}}><SunIcon/></button>
                    <button onClick={()=>setThemeMode('dark')} style={{padding:'6px', border:'none', background:'transparent', color: themeMode==='dark'?currentTheme.accent:currentTheme.textSub, cursor:'pointer'}}><MoonIcon/></button>
                  </div>
               </div>
               <button onClick={handleLogout} style={{width:'100%', padding:'10px', background:'transparent', color:'#ef4444', border:'1px solid #ef4444', borderRadius:'8px', cursor:'pointer', fontWeight:'600', fontSize:'13px'}}>Logout</button>
             </div>
          </div>

          <div className="main">
             <header className="glass" style={{position:'sticky', top:0, zIndex:30, padding:'15px 25px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
               <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                 <button onClick={()=>setIsSidebarOpen(true)} style={{fontSize:'20px', background:'none', border:'none', color: currentTheme.text, cursor:'pointer', display:'block'}} className="burger">☰</button>
                 <h2 style={{margin:0, fontSize:'16px'}}>Dashboard</h2>
               </div>
               <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                 <div style={{textAlign:'right'}} className="hide-mobile">
                   <div style={{fontSize:'13px', fontWeight:'600'}}>{registeredUser ? registeredUser.name : 'Admin'}</div>
                   <div style={{fontSize:'10px', color: botStatus==='WAITING_SCAN'?'#22c55e':currentTheme.textSub}}>{botStatus === 'IDLE' ? 'Offline' : 'Online'}</div>
                 </div>
                 <div onClick={()=>setShowProfileModal(true)} style={{width:'36px', height:'36px', borderRadius:'50%', background: currentTheme.accent, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#fff', fontWeight:'600'}}>
                   {registeredUser ? registeredUser.name.charAt(0).toUpperCase() : 'A'}
                 </div>
               </div>
             </header>

             <div style={{padding:'25px'}}>
               {activeTab === 'dashboard' && (
                 <div className="glass" style={{padding:'30px', borderRadius:'16px'}}>
                    <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap:'30px'}}>
                      
                      {/* KOLOM KIRI (SETUP / STATUS) */}
                      <div>
                        <h3 style={{marginTop:0, borderBottom:`1px solid ${currentTheme.glassBorder}`, paddingBottom:'15px', fontSize:'16px'}}>
                          {botStatus === 'IDLE' ? 'Setup Bot' : 'Status Koneksi'}
                        </h3>
                        <div style={{padding:'20px', background: themeMode==='dark'?'rgba(0,0,0,0.3)':'#f8fafc', borderRadius:'12px', marginTop:'20px'}}>
                           
                           {/* STATUS: IDLE / PAIRING (INPUT NOMOR) */}
                           {(botStatus === 'IDLE' || botStatus === 'PAIRING') && (
                             <form onSubmit={handleStartBot}>
                               <div style={{marginBottom:'15px'}}>
                                 <label style={{marginBottom:'8px'}}>MASUKKAN NOMOR WHATSAPP</label>
                                 <input 
                                    type="number" 
                                    placeholder="Contoh: 628123456789" 
                                    value={formData.waNumber} 
                                    onChange={e=>setFormData({...formData, waNumber: e.target.value})} 
                                 />
                                 <div style={{fontSize:'11px', color: currentTheme.textSub, marginTop:'5px'}}>*Gunakan awalan kode negara (62). Jangan pakai + atau 0.</div>
                               </div>
                               <button type="submit" className="btn-primary" disabled={botStatus === 'PAIRING'}>
                                 {botStatus === 'PAIRING' ? 'Menghubungkan...' : 'Minta Pairing Code'}
                               </button>
                             </form>
                           )}

                           {/* STATUS: WAITING SCAN (TAMPIL KODE PAIRING) */}
                           {botStatus === 'WAITING_SCAN' && (
                             <div style={{textAlign:'center', padding:'20px 0'}}>
                               <div style={{fontSize:'14px', color: currentTheme.textSub, marginBottom:'10px'}}>Silakan masukkan kode ini di WhatsApp Anda:</div>
                               <div style={{
                                 fontSize:'32px', fontWeight:'800', letterSpacing:'6px', fontFamily:'monospace',
                                 background: currentTheme.accent, color:'#fff', padding:'15px', borderRadius:'12px',
                                 display:'inline-block', marginBottom:'20px'
                               }}>
                                 {pairingCode || '....-....'}
                               </div>
                               
                               <div style={{textAlign:'left', fontSize:'12px', color: currentTheme.textSub, background: currentTheme.inputBg, padding:'15px', borderRadius:'8px', lineHeight:'1.6'}}>
                                 <strong>Cara Tautkan:</strong><br/>
                                 1. Buka WhatsApp di HP<br/>
                                 2. Klik titik tiga (Android) atau Pengaturan (iOS)<br/>
                                 3. Pilih <b>Perangkat Tertaut</b> &gt; <b>Tautkan Perangkat</b><br/>
                                 4. Klik <b>"Tautkan dengan nomor telepon saja"</b> di bagian bawah<br/>
                                 5. Masukkan kode di atas.
                               </div>
                               
                               <button onClick={()=>setBotStatus('IDLE')} style={{marginTop:'20px', background:'transparent', border:'none', color:'#ef4444', fontSize:'12px', cursor:'pointer', textDecoration:'underline'}}>Batalkan</button>
                             </div>
                           )}

                           {/* STATUS: CONNECTED */}
                           {botStatus === 'CONNECTED' && (
                             <div style={{textAlign:'center', padding:'10px 0'}}>
                               <div style={{width:'80px', height:'80px', background:'#10b981', borderRadius:'50%', margin:'0 auto 15px', display:'flex', alignItems:'center', justifyContent:'center'}}>
                                 <svg width="40" height="40" fill="none" stroke="#fff" strokeWidth="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                               </div>
                               <h3 style={{margin:0, color:'#10b981'}}>Bot Berhasil Terhubung!</h3>
                               <p style={{fontSize:'13px', color: currentTheme.textSub}}>Bot Anda sedang berjalan aktif.</p>
                               
                               <div style={{display:'flex', gap:'10px', marginTop:'25px'}}>
                                 <div style={{flex:1, background: currentTheme.inputBg, padding:'10px', borderRadius:'8px', border:`1px solid ${currentTheme.inputBorder}`}}>
                                   <div style={{fontSize:'10px', color: currentTheme.textSub}}>SISA WAKTU</div>
                                   <div style={{fontWeight:'700', fontSize:'14px'}}>{timeLeft}</div>
                                 </div>
                                 <div style={{flex:1, background: currentTheme.inputBg, padding:'10px', borderRadius:'8px', border:`1px solid ${currentTheme.inputBorder}`}}>
                                   <div style={{fontSize:'10px', color: currentTheme.textSub}}>STATUS</div>
                                   <div style={{fontWeight:'700', fontSize:'14px', color:'#10b981'}}>ONLINE</div>
                                 </div>
                               </div>

                               <button onClick={handleStopBot} style={{marginTop:'25px', width:'100%', padding:'12px', background:'#ef4444', color:'#fff', border:'none', borderRadius:'8px', fontWeight:'600', cursor:'pointer'}}>
                                 Matikan Sesi (Logout)
                               </button>
                             </div>
                           )}
                        </div>
                      </div>

                      {/* KOLOM KANAN (TERMINAL LOGS) */}
                      <div style={{display:'flex', flexDirection:'column'}}>
                        <h3 style={{marginTop:0, borderBottom:`1px solid ${currentTheme.glassBorder}`, paddingBottom:'15px', fontSize:'16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                          <span>Terminal Server</span>
                          <span style={{fontSize:'10px', padding:'4px 8px', background: botStatus==='CONNECTED'?'#10b981':'#64748b', color:'#fff', borderRadius:'4px'}}>
                            {botStatus === 'CONNECTED' ? 'LIVE' : 'OFFLINE'}
                          </span>
                        </h3>
                        
                        <div className="terminal-box" style={{
                          flex: 1, minHeight:'400px', maxHeight:'500px',
                          background: '#000', color: '#0f0', fontFamily:'monospace', fontSize:'12px',
                          padding:'15px', borderRadius:'12px', marginTop:'20px',
                          overflowY:'auto', border: `1px solid ${currentTheme.glassBorder}`,
                          display:'flex', flexDirection:'column'
                        }}>
                          {logs.length === 0 && (
                            <div style={{color:'#555', fontStyle:'italic', margin:'auto'}}>Menunggu log server...</div>
                          )}
                          {logs.map((log, i) => (
                            <div key={i} style={{marginBottom:'4px', wordBreak:'break-all'}}>
                              <span style={{color:'#666'}}>{log.split(']')[0]}]</span> 
                              <span style={{color: log.includes('Error') ? '#ef4444' : (log.includes('Gagal') ? '#f59e0b' : '#22c55e')}}>
                                {log.split(']').slice(1).join(']')}
                              </span>
                            </div>
                          ))}
                          <div ref={logsEndRef} />
                        </div>
                        
                        <div style={{marginTop:'10px', display:'flex', gap:'10px'}}>
                          <input type="text" placeholder="Ketik command terminal... (Coming Soon)" disabled style={{background: currentTheme.inputBg, border:`1px solid ${currentTheme.glassBorder}`, color: currentTheme.textSub, cursor:'not-allowed'}} />
                          <button style={{padding:'0 20px', background: currentTheme.glassBorder, border:'none', borderRadius:'8px', color: currentTheme.textSub, cursor:'not-allowed'}}>Send</button>
                        </div>
                      </div>

                    </div>
                 </div>
               )}

               {/* TAB LAIN: SETTINGS / LOGS (Placeholder) */}
               {activeTab !== 'dashboard' && (
                 <div className="glass" style={{padding:'40px', borderRadius:'16px', textAlign:'center'}}>
                   <div style={{fontSize:'40px', marginBottom:'10px'}}>🚧</div>
                   <h3>Halaman {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
                   <p style={{color: currentTheme.textSub}}>Fitur ini sedang dalam pengembangan.</p>
                   <button onClick={()=>setActiveTab('dashboard')} className="btn-outline" style={{maxWidth:'200px', margin:'20px auto'}}>Kembali ke Dashboard</button>
                 </div>
               )}

             </div>
          </div>
        </>
      )}
    </>
  );
}