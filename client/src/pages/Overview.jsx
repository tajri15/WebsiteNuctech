import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, List, Typography, Tag, Spin } from 'antd';
import io from 'socket.io-client';
import axios from 'axios';

// Hubungkan ke server backend Anda
const socket = io('http://localhost:5000');

const Overview = () => {
  const [stats, setStats] = useState({ total: 0, ok: 0, nok: 0 });
  const [recentScans, setRecentScans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fungsi untuk mengambil data awal saat halaman pertama kali dimuat
  const fetchInitialData = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/scans?limit=5');
      const scans = response.data;

      // Ambil semua data untuk menghitung statistik total
      const allScansResponse = await axios.get('http://localhost:5000/api/scans?limit=10000'); // Ambil banyak data untuk statistik
      const allScans = allScansResponse.data;

      const total = allScans.length;
      const ok = allScans.filter(s => s.status === 'OK').length;
      const nok = total - ok;
      setStats({ total, ok, nok });

      // Tampilkan 5 data terbaru di daftar
      setRecentScans(scans);
    } catch (error) {
      console.error("Gagal mengambil data awal", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Ambil data awal
    fetchInitialData();

    // 2. Dengarkan event 'new_scan' dari server
    socket.on('new_scan', (newScan) => {
      console.log('Menerima data scan baru:', newScan);
      
      // Tambahkan data baru ke paling atas daftar (dan buang yang paling bawah jika lebih dari 5)
      setRecentScans(prevScans => [newScan, ...prevScans.slice(0, 4)]);

      // Perbarui statistik
      setStats(prevStats => ({
        total: prevStats.total + 1,
        ok: prevStats.ok + (newScan.status === 'OK' ? 1 : 0),
        nok: prevStats.nok + (newScan.status === 'NOK' ? 1 : 0),
      }));
    });

    // 3. Cleanup: Hentikan listener saat komponen tidak lagi ditampilkan
    return () => {
      socket.off('new_scan');
    };
  }, []); // Array kosong berarti efek ini hanya berjalan sekali saat komponen dimuat

  const okPercentage = stats.total > 0 ? ((stats.ok / stats.total) * 100).toFixed(1) : 0;

  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: '50px' }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Total Scan" value={stats.total} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Total OK" value={stats.ok} valueStyle={{ color: '#3f8600' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Total NOK" value={stats.nok} valueStyle={{ color: '#cf1322' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Percentage OK" value={okPercentage} suffix="%" /></Card>
        </Col>
      </Row>

      <Card title="Realtime Log Transaction" style={{ marginTop: 24 }}>
        <List
          dataSource={recentScans}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={`Container: ${item.container_no} | Truck: ${item.truck_no}`}
                description={`Scan Time: ${new Date(item.scan_time).toLocaleString('id-ID')}`}
              />
              <Tag color={item.status === 'OK' ? 'green' : 'red'}>{item.status}</Tag>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default Overview;