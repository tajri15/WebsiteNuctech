import React, { useState, useEffect, useRef } from 'react';
import {
  Row, Col, Card, Statistic, Typography, Tag, Spin, Alert,
  Progress, Badge, Descriptions, List, Button
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, CloudServerOutlined,
  DatabaseOutlined, ClockCircleOutlined,
  ReloadOutlined, TeamOutlined, CalendarOutlined,
  CloudUploadOutlined, ApiOutlined, RocketOutlined
} from '@ant-design/icons';
import io from 'socket.io-client';
import axios from 'axios';

const { Title, Text } = Typography;

const Overview = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ 
    total: 0, 
    ok: 0, 
    nok: 0 
  });
  const [recentScans, setRecentScans] = useState([]);
  const [systemState, setSystemState] = useState({
    ftpServer: { 
      name: 'FTP Server', 
      status: 'connected', 
      lastActivity: '-',
      details: 'Monitoring for file uploads',
      ip: '10.226.62.31',
      type: 'FTP',
      currentActivity: 'Monitoring upload'
    },
    apiServer: { 
      name: 'API Server', 
      status: 'standby', 
      lastActivity: '-',
      details: 'Ready to receive JSON data',
      ip: '10.226.62.32',
      type: 'HTTP API',
      currentActivity: 'Menunggu data JSON'
    }
  });

  const [systemActivity, setSystemActivity] = useState({
    uptime: '0 days 00:00:00',
    lastUpdate: '00:00:00',
    activeConnections: 0,
    logFiles: '0 files',
    totalScans: 0,
    successfulScans: 0,
    failedScans: 0,
    successRate: '0%'
  });

  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);

  // Fungsi untuk fetch data dengan fallback
  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔄 Fetching initial data from server...');
      
      const response = await axios.get('http://localhost:5000/api/initial-data');
      console.log('📦 API Response:', response.data);
      
      if (response.data.success) {
        const { stats, recentScans, systemState, systemActivity } = response.data;
        
        // Pastikan data ada sebelum di-set
        if (stats) {
          setStats({
            total: parseInt(stats.total) || 0,
            ok: parseInt(stats.ok) || 0,
            nok: parseInt(stats.nok) || 0
          });
        }
        
        if (recentScans && Array.isArray(recentScans)) {
          setRecentScans(recentScans);
        } else {
          setRecentScans([]);
        }
        
        if (systemState) {
          setSystemState(prev => ({
            ftpServer: systemState.ftpServer1 || prev.ftpServer,
            apiServer: systemState.ftpServer2 || prev.apiServer
          }));
        }
        
        if (systemActivity) {
          setSystemActivity(prev => ({
            ...prev,
            ...systemActivity
          }));
        }
        
        console.log('✅ Initial data loaded successfully');
        
      } else {
        throw new Error('Invalid response format: success false');
      }
      
    } catch (err) {
      console.error("❌ Gagal mengambil data awal:", err);
      
      // Fallback: coba ambil data dari endpoint yang ada
      try {
        console.log('🔄 Trying fallback endpoints...');
        const [statsResponse, scansResponse] = await Promise.all([
          axios.get('http://localhost:5000/api/stats'),
          axios.get('http://localhost:5000/api/scans?page=1&pageSize=10')
        ]);

        const fallbackStats = statsResponse.data;
        const fallbackScans = scansResponse.data.data || [];

        setStats({
          total: parseInt(fallbackStats.total) || 0,
          ok: parseInt(fallbackStats.ok) || 0,
          nok: parseInt(fallbackStats.nok) || 0
        });
        setRecentScans(fallbackScans);
        
        // Update system activity dengan data real
        setSystemActivity(prev => ({
          ...prev,
          totalScans: parseInt(fallbackStats.total) || 0,
          successfulScans: parseInt(fallbackStats.ok) || 0,
          failedScans: parseInt(fallbackStats.nok) || 0,
          successRate: fallbackStats.total > 0 ? 
            ((fallbackStats.ok / fallbackStats.total) * 100).toFixed(1) + '%' : '0%',
          lastUpdate: new Date().toLocaleTimeString('id-ID')
        }));

        console.log('✅ Fallback data loaded successfully');
        
      } catch (fallbackError) {
        console.error("❌ Fallback juga gagal:", fallbackError);
        setError("Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:5000");
      }
    } finally {
      setLoading(false);
    }
  };

  // Fungsi untuk refresh data manual
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchInitialData();
    } catch (err) {
      console.error("Gagal refresh data:", err);
    } finally {
      setRefreshing(false);
    }
  };

  // Fungsi untuk mendapatkan warna status
  const getStatusColor = (status) => {
    switch (status) {
      case 'connected': return 'green';
      case 'uploading': return 'blue';
      case 'processing': return 'orange';
      case 'standby': return 'default';
      case 'error': return 'red';
      default: return 'default';
    }
  };

  // Fungsi untuk mendapatkan icon status
  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected': return <CheckCircleOutlined />;
      case 'uploading': return <CloudUploadOutlined />;
      case 'processing': return <CheckCircleOutlined />;
      case 'standby': return <ClockCircleOutlined />;
      case 'error': return <CloseCircleOutlined />;
      default: return <ClockCircleOutlined />;
    }
  };

  // Setup WebSocket connection
  useEffect(() => {
    // Cegah multiple connections
    if (socketRef.current?.connected) {
      console.log('🔌 Socket sudah connected, skip');
      return;
    }

    console.log('🔌 Creating WebSocket connection...');
    
    const newSocket = io('http://localhost:5000', {
      transports: ['websocket'],
      timeout: 10000
    });

    newSocket.on('connect', () => {
      console.log('✅ Connected to WebSocket server');
      socketRef.current = newSocket;
      setSocket(newSocket);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected');
      socketRef.current = null;
      setSocket(null);
    });

    // Listener untuk update scan baru
    newSocket.on('new_scan', (data) => {
      console.log('📨 New scan received:', data);
      
      setRecentScans(prev => [data, ...prev.slice(0, 9)]);
      setStats(prev => ({
        total: parseInt(prev.total, 10) + 1,
        ok: prev.ok + (data.status === 'OK' ? 1 : 0),
        nok: prev.nok + (data.status !== 'OK' ? 1 : 0),
      }));
      
      // Update system activity
      setSystemActivity(prev => ({
        ...prev,
        totalScans: prev.totalScans + 1,
        successfulScans: prev.successfulScans + (data.status === 'OK' ? 1 : 0),
        failedScans: prev.failedScans + (data.status !== 'OK' ? 1 : 0),
        successRate: prev.totalScans + 1 > 0 ? 
          (((prev.successfulScans + (data.status === 'OK' ? 1 : 0)) / (prev.totalScans + 1)) * 100).toFixed(1) + '%' : '0%',
        lastUpdate: new Date().toLocaleTimeString('id-ID')
      }));
    });

    // Listener untuk update FTP status
    newSocket.on('ftp_update', (ftpData) => {
      console.log('📡 FTP update received:', ftpData);
      
      if (ftpData.ftpServer) {
        setSystemState(prev => ({
          ...prev,
          ftpServer: {
            ...prev.ftpServer,
            status: ftpData.ftpServer.status || prev.ftpServer.status,
            lastActivity: ftpData.ftpServer.lastActivity || prev.ftpServer.lastActivity,
            details: ftpData.ftpServer.details || prev.ftpServer.details,
            currentActivity: ftpData.ftpServer.currentActivity || prev.ftpServer.currentActivity
          }
        }));
      }
    });

    // Listener untuk update API status
    newSocket.on('api_update', (apiData) => {
      console.log('🔗 API update received:', apiData);
      
      if (apiData.apiServer) {
        setSystemState(prev => ({
          ...prev,
          apiServer: {
            ...prev.apiServer,
            status: apiData.apiServer.status || prev.apiServer.status,
            lastActivity: apiData.apiServer.lastActivity || prev.apiServer.lastActivity,
            details: apiData.apiServer.details || prev.apiServer.details,
            currentActivity: apiData.apiServer.currentActivity || prev.apiServer.currentActivity
          }
        }));
      }
    });

    // Listener untuk update system activity
    newSocket.on('system_activity_update', (activityData) => {
      console.log('🔄 System activity update:', activityData);
      setSystemActivity(prev => ({
        ...prev,
        ...activityData
      }));
    });

    return () => {
      console.log('🧹 Cleaning up WebSocket connection...');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Fetch initial data pada mount
  useEffect(() => {
    fetchInitialData();
  }, []);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '50vh',
        flexDirection: 'column'
      }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Memuat data overview...</Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <Alert 
          message="Connection Error" 
          description={error} 
          type="error" 
          showIcon 
          action={
            <Button size="small" onClick={handleRefresh}>
              Try Again
            </Button>
          }
        />
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button type="primary" onClick={handleRefresh}>
            <ReloadOutlined /> Refresh
          </Button>
        </div>
      </div>
    );
  }
  
  const okPercentage = stats.total > 0 ? ((stats.ok / stats.total) * 100).toFixed(1) : '0.0';

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      {/* Header dengan tombol refresh */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={2} style={{ margin: 0, color: '#1890ff' }}>
            <RocketOutlined /> System Overview
          </Title>
          <Text type="secondary">Real-time monitoring of transmission system and scan activities</Text>
        </div>
        <Button 
          type="primary" 
          icon={<ReloadOutlined />} 
          loading={refreshing}
          onClick={handleRefresh}
        >
          Refresh Data
        </Button>
      </div>

      <Row gutter={[24, 24]}>
        {/* Main Content Column */}
        <Col xs={24} lg={16}>
          <Row gutter={[24, 24]}>
            {/* Server Status */}
            <Col xs={24}>
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <CloudServerOutlined style={{ marginRight: 8 }} />
                    <span>Server Status - Real Time</span>
                  </div>
                }
                style={{ borderRadius: 8 }}
                extra={
                  <Tag color="green" icon={<CheckCircleOutlined />}>
                    System Online
                  </Tag>
                }
              >
                <div style={{ marginBottom: 16 }}>
                  <Text strong>Real-time monitoring of FTP and API server activities</Text>
                </div>
                
                <Row gutter={[24, 16]}>
                  {/* FTP Server */}
                  <Col xs={24} md={12}>
                    <Card 
                      size="small"
                      title={
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <CloudUploadOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                          <span>FTP Server</span>
                        </div>
                      }
                      style={{ 
                        border: '1px solid #1890ff',
                        background: '#f0f8ff'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text strong style={{ fontSize: '16px' }}>{systemState.ftpServer.name}</Text>
                        <Tag 
                          color={getStatusColor(systemState.ftpServer.status)}
                          icon={getStatusIcon(systemState.ftpServer.status)}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                          {systemState.ftpServer.status.toUpperCase()}
                        </Tag>
                      </div>
                      
                      <div style={{ marginBottom: 8 }}>
                        <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#1890ff', fontFamily: 'monospace' }}>
                          {systemState.ftpServer.ip}
                        </Text>
                      </div>
                      
                      <div style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                          {systemState.ftpServer.details}
                        </Text>
                      </div>
                      
                      <div>
                        <Text strong style={{ fontSize: '12px', display: 'block', color: '#666' }}>
                          Current Activity:
                        </Text>
                        <Text type="secondary" style={{ fontSize: '11px', display: 'block', fontStyle: 'italic' }}>
                          {systemState.ftpServer.currentActivity}
                        </Text>
                      </div>
                      
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>
                          <ClockCircleOutlined /> Last: {systemState.ftpServer.lastActivity}
                        </Text>
                      </div>
                    </Card>
                  </Col>

                  {/* API Server */}
                  <Col xs={24} md={12}>
                    <Card 
                      size="small"
                      title={
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <ApiOutlined style={{ marginRight: 8, color: '#52c41a' }} />
                          <span>API Server</span>
                        </div>
                      }
                      style={{ 
                        border: '1px solid #52c41a',
                        background: '#f6ffed'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text strong style={{ fontSize: '16px' }}>{systemState.apiServer.name}</Text>
                        <Tag 
                          color={getStatusColor(systemState.apiServer.status)}
                          icon={getStatusIcon(systemState.apiServer.status)}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                          {systemState.apiServer.status.toUpperCase()}
                        </Tag>
                      </div>
                      
                      <div style={{ marginBottom: 8 }}>
                        <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#52c41a', fontFamily: 'monospace' }}>
                          {systemState.apiServer.ip}
                        </Text>
                      </div>
                      
                      <div style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                          {systemState.apiServer.details}
                        </Text>
                      </div>
                      
                      <div>
                        <Text strong style={{ fontSize: '12px', display: 'block', color: '#666' }}>
                          Current Activity:
                        </Text>
                        <Text type="secondary" style={{ fontSize: '11px', display: 'block', fontStyle: 'italic' }}>
                          {systemState.apiServer.currentActivity}
                        </Text>
                      </div>
                      
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>
                          <ClockCircleOutlined /> Last: {systemState.apiServer.lastActivity}
                        </Text>
                      </div>
                    </Card>
                  </Col>
                </Row>
              </Card>
            </Col>
            
            {/* Recent Scan Activity - FULL WIDTH */}
            <Col xs={24}>
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Recent Scan Activity</span>
                    <Badge count={recentScans.length} showZero color='#1890ff' />
                  </div>
                } 
                style={{ borderRadius: 8 }}
                bodyStyle={{ padding: 0 }}
              >
                <List
                  dataSource={recentScans}
                  renderItem={(scan) => (
                    <List.Item
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f0f0f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <Text strong style={{ display: 'block', fontSize: '14px' }}>
                          Container: {scan.container_no || 'N/A'}
                        </Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          Truck: {scan.truck_no || 'N/A'}
                        </Text>
                        <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginTop: 4 }}>
                          <CalendarOutlined /> {scan.scan_time ? new Date(scan.scan_time).toLocaleString() : 'Unknown date'}
                        </Text>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Tag 
                          color={scan.status === 'OK' ? 'green' : 'red'}
                          style={{ fontSize: '12px', marginBottom: 4 }}
                        >
                          {scan.status || 'UNKNOWN'}
                        </Tag>
                        <br />
                        <Text type="secondary" style={{ fontSize: '10px' }}>
                          ID: {scan.id || 'N/A'}
                        </Text>
                      </div>
                    </List.Item>
                  )}
                  locale={{ emptyText: 'No scan activity yet' }}
                />
              </Card>
            </Col>
          </Row>
        </Col>

        {/* Sidebar Column */}
        <Col xs={24} lg={8}>
          <Row gutter={[24, 24]}>
            {/* Total Scans Card */}
            <Col xs={24}>
              <Card 
                style={{ 
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                  color: 'white'
                }}
                bodyStyle={{ padding: 24, textAlign: 'center' }}
              >
                <Statistic
                  title={<span style={{ color: 'white' }}>TOTAL SCANS</span>}
                  value={systemActivity.totalScans || stats.total}
                  valueStyle={{ color: 'white', fontSize: 48 }}
                  prefix={<DatabaseOutlined />}
                />
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', marginTop: 8 }}>
                  Updated: {systemActivity.lastUpdate}
                </Text>
              </Card>
            </Col>

            {/* Success/Failure Stats */}
            <Col xs={24}>
              <Card 
                title="Scan Results" 
                style={{ borderRadius: 8 }}
                bodyStyle={{ padding: 16 }}
              >
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={12}>
                    <div style={{ textAlign: 'center', padding: 12, background: '#f6ffed', borderRadius: 6 }}>
                      <Statistic
                        title="SUCCESSFUL"
                        value={systemActivity.successfulScans || stats.ok}
                        valueStyle={{ color: '#52c41a', fontSize: 24 }}
                        prefix={<CheckCircleOutlined />}
                      />
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ textAlign: 'center', padding: 12, background: '#fff2f0', borderRadius: 6 }}>
                      <Statistic
                        title="FAILED"
                        value={systemActivity.failedScans || stats.nok}
                        valueStyle={{ color: '#ff4d4f', fontSize: 24 }}
                        prefix={<CloseCircleOutlined />}
                      />
                    </div>
                  </Col>
                </Row>
                
                <div style={{ textAlign: 'center', padding: 12, background: '#f0f8ff', borderRadius: 6 }}>
                  <Statistic
                    title="SUCCESS RATE"
                    value={parseFloat(systemActivity.successRate) || parseFloat(okPercentage)}
                    suffix="%"
                    valueStyle={{ color: '#1890ff', fontSize: 28 }}
                  />
                  <Progress 
                    percent={parseFloat(systemActivity.successRate) || parseFloat(okPercentage)} 
                    size="small" 
                    strokeColor={{
                      '0%': '#108ee9',
                      '100%': '#87d068',
                    }}
                  />
                </div>
              </Card>
            </Col>

            {/* Quick Stats */}
            <Col xs={24}>
              <Card 
                title="System Status" 
                style={{ borderRadius: 8 }}
                bodyStyle={{ padding: 16 }}
              >
                <Descriptions column={1} size="small">
                  <Descriptions.Item 
                    label={
                      <span>
                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                        Uptime
                      </span>
                    }
                  >
                    <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                      {systemActivity.uptime}
                    </Tag>
                  </Descriptions.Item>
                  
                  <Descriptions.Item 
                    label={
                      <span>
                        <CalendarOutlined style={{ marginRight: 4 }} />
                        Last Update
                      </span>
                    }
                  >
                    <Tag color="green" style={{ fontFamily: 'monospace' }}>
                      {systemActivity.lastUpdate}
                    </Tag>
                  </Descriptions.Item>
                  
                  <Descriptions.Item 
                    label={
                      <span>
                        <TeamOutlined style={{ marginRight: 4 }} />
                        Connections
                      </span>
                    }
                  >
                    <Tag color="orange">
                      {systemActivity.activeConnections} active
                    </Tag>
                  </Descriptions.Item>
                  
                  <Descriptions.Item 
                    label={
                      <span>
                        <DatabaseOutlined style={{ marginRight: 4 }} />
                        Log Files
                      </span>
                    }
                  >
                    <Tag color="purple">
                      {systemActivity.logFiles}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>
    </div>
  );
};

export default Overview;