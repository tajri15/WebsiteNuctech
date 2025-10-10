import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';
import TransactionList from './components/TransactionList';

const SOCKET_SERVER_URL = "http://localhost:3001";

function App() {
  const [transactions, setTransactions] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL);

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('new_transaction', (data) => {
      setTransactions(prev => [data, ...prev.slice(0, 99)]); // Tampilkan 100 transaksi terakhir
    });

    return () => { socket.disconnect(); };
  }, []);

  return (
    <div className="App">
      <header className="app-header">
        <h1>🚢 Real-time Pelabuhan Log Monitor</h1>
        <p className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
          Status: {isConnected ? 'Terhubung' : 'Terputus'}
        </p>
      </header>
      <main>
        <TransactionList transactions={transactions} />
      </main>
    </div>
  );
}
export default App;