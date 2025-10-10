import React from 'react';
import './TransactionList.css';

const TransactionList = ({ transactions }) => {
  if (transactions.length === 0) {
    return <div className="no-transactions">Menunggu data transaksi dari server...</div>;
  }

  return (
    <div className="transaction-container">
      {transactions.map((tx, index) => (
        <div key={`${tx.SCANTIME}-${index}`} className="transaction-card">
          <div className="card-header">
            <h3>Kontainer: {tx.CONTAINER_NO || 'N/A'}</h3>
          </div>
          <div className="card-details">
            <p><strong>Plat Truk:</strong> {tx.VEHICLE_NO || 'N/A'}</p>
            <p><strong>Waktu Scan:</strong> {new Date(tx.SCANTIME).toLocaleString('id-ID')}</p>
            <p><strong>ID Scan:</strong> {tx.SCANID || 'N/A'}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TransactionList;