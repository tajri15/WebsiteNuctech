import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, List, Typography, Tag, Spin, Alert } from 'antd';
import io from 'socket.io-client';
import axios from 'axios';

const socket = io('http://localhost:5000');

const Overview = () => {
  const [stats, setStats] = useState({ total: 0, ok: 0, nok: 0 });
  const [recentScans, setRecentScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInitialData = async () => {
    try {
      const [scansResponse, statsResponse] = await Promise.all([
        axios.get('http://localhost:5000/api/scans?page=1&pageSize=5'),
        axios.get('http://localhost:5000/api/stats/overview')
      ]);

      setRecentScans(scansResponse.data.data);
      setStats(statsResponse.data);
      setError(null);
    } catch (error) {
      console.error("Gagal mengambil data awal", error);
      setError("Gagal memuat data dari server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();

    socket.on('new_scan', (newScan) => {
      console.log('Menerima data scan baru:', newScan);
      
      setRecentScans(prevScans => [newScan, ...prevScans.slice(0, 4)]);
      setStats(prevStats => ({
        total: prevStats.total + 1,
        ok: prevStats.ok + (newScan.status === 'OK' ? 1 : 0),
        nok: prevStats.nok + (newScan.status === 'NOK' ? 1 : 0),
      }));
    });

    return () => {
      socket.off('new_scan');
    };
  }, []);

  const okPercentage = stats.total > 0 ? ((stats.ok / stats.total) * 100).toFixed(1) : 0;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', marginTop: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Error"
        description={error}
        type="error"
        showIcon
        style={{ marginBottom: 16 }}
      />
    );
  }

  return (
    <div>
      <Typography.Title level={2} style={{ marginBottom: 24 }}>
        Dashboard Overview
      </Typography.Title>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Total Scan" value={stats.total} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic 
              title="Total OK" 
              value={stats.ok} 
              valueStyle={{ color: '#52c41a' }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic 
              title="Total NOK" 
              value={stats.nok} 
              valueStyle={{ color: '#ff4d4f' }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic 
              title="Success Rate" 
              value={okPercentage} 
              suffix="%" 
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Card 
        title="Recent Transactions" 
        style={{ marginTop: 24 }}
        bodyStyle={{ padding: 0 }}
      >
        <List
          dataSource={recentScans}
          renderItem={(item) => (
            <List.Item
              style={{
                padding: '12px 24px',
                borderBottom: '1px solid #f0f0f0'
              }}
            >
              <List.Item.Meta
                title={
                  <Typography.Text strong>
                    Container: {item.container_no} | Truck: {item.truck_no}
                  </Typography.Text>
                }
                description={
                  <Typography.Text type="secondary">
                    Scan Time: {new Date(item.scan_time).toLocaleString('id-ID')}
                  </Typography.Text>
                }
              />
              <Tag 
                color={item.status === 'OK' ? 'green' : 'red'}
                style={{ fontSize: '12px', fontWeight: 'bold' }}
              >
                {item.status}
              </Tag>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default Overview;