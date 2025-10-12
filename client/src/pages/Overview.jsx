import React, { useState, useEffect } from 'react';
import {
  Row, Col, Card, Statistic, Timeline, Typography, Tag, Spin, Alert,
  Progress, Badge, Descriptions, List, Button
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, CloudServerOutlined,
  DatabaseOutlined, FileTextOutlined, UploadOutlined, ClockCircleOutlined,
  WifiOutlined, SyncOutlined, FileSyncOutlined, ReloadOutlined,
  FileOutlined, TeamOutlined, CalendarOutlined
} from '@ant-design/icons';
import io from 'socket.io-client';
import axios from 'axios';

const { Title, Text } = Typography;
const socket = io('http://localhost:5000');

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
    ftpServer1: { 
      name: 'FTP Server 1', 
      status: 'standby', 
      lastActivity: '-',
      details: 'Waiting for activity...',
      ip: '0.0.0.0'
    },
    ftpServer2: { 
      name: 'FTP Server 2', 
      status: 'standby', 
      lastActivity: '-',
      details: 'Standby server',
      ip: '0.0.0.0'
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

  // Fungsi untuk refresh data manual
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const response = await axios.get('http://localhost:5000/api/initial-data');
      const { stats, recentScans, systemState, systemActivity } = response.data;
      
      if (stats) setStats(stats);
      if (recentScans) setRecentScans(recentScans);
      if (systemState) setSystemState(systemState);
      if (systemActivity) setSystemActivity(systemActivity);
      
      setError(null);
    } catch (err) {
      console.error("Gagal refresh data:", err);
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setRefreshing(false);
    }
  };

  // Efek untuk mengambil data awal dan setup listener WebSocket
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const response = await axios.get('http://localhost:5000/api/initial-data');
        const { stats, recentScans, systemState, systemActivity } = response.data;
        
        if (stats) setStats(stats);
        if (recentScans) setRecentScans(recentScans);
        if (systemState) setSystemState(systemState);
        if (systemActivity) setSystemActivity(systemActivity);
        
        setError(null);
      } catch (err) {
        console.error("Gagal mengambil data awal:", err);
        setError("Tidak dapat terhubung ke server. Pastikan server berjalan.");
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();

    // Listener untuk update scan baru
    socket.on('new_scan', (data) => {
      console.log('New scan received:', data);
      setRecentScans(prev => [data.scan, ...prev.slice(0, 9)]);
      setStats(prev => ({
        total: parseInt(prev.total, 10) + 1,
        ok: prev.ok + (data.scan.status === 'OK' ? 1 : 0),
        nok: prev.nok + (data.scan.status !== 'OK' ? 1 : 0),
      }));
    });

    // Listener untuk update FTP status
    socket.on('ftp_update', (ftpData) => {
      console.log('FTP update received:', ftpData);
      setSystemState(prev => ({
        ...prev,
        ftpServer1: {
          ...prev.ftpServer1,
          status: ftpData.server1.status,
          lastActivity: ftpData.server1.lastActivity,
          details: ftpData.server1.details,
          ip: ftpData.server1.ip
        },
        ftpServer2: {
          ...prev.ftpServer2,
          status: ftpData.server2.status,
          lastActivity: ftpData.server2.lastActivity,
          details: ftpData.server2.details,
          ip: ftpData.server2.ip
        }
      }));
    });

    // Listener untuk update system activity
    socket.on('system_activity_update', (activityData) => {
      console.log('System activity update:', activityData);
      setSystemActivity(prev => ({
        ...prev,
        ...activityData
      }));
    });

    // Cleanup listeners
    return () => {
      socket.off('new_scan');
      socket.off('ftp_update');
      socket.off('system_activity_update');
    };
  }, []);

  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: '50px' }}><Spin size="large" /></div>;
  }

  if (error) {
    return <Alert message="Error" description={error} type="error" showIcon style={{ margin: 24 }} />;
  }
  
  const okPercentage = stats.total > 0 ? ((stats.ok / stats.total) * 100).toFixed(1) : '0.0';
  const ftpServers = [systemState.ftpServer1, systemState.ftpServer2];

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      {/* Header dengan tombol refresh */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={2} style={{ margin: 0, color: '#1890ff' }}>Server Activity Overview</Title>
          <Text type="secondary">Real-time monitoring of transmission logs and system activity.</Text>
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
            {/* Transmission Server Status */}
            <Col xs={24}>
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <CloudServerOutlined style={{ marginRight: 8 }} />
                    <span>Transmission Server Status</span>
                  </div>
                }
                style={{ borderRadius: 8 }}
              >
                <div style={{ marginBottom: 16 }}>
                  <Text strong>Monitoring transmission logs in real-time with proactive health checks.</Text>
                </div>
                
                <Row gutter={[24, 16]}>
                  {/* FTP Connectivity */}
                  <Col xs={24}>
                    <Card 
                      title={
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <WifiOutlined style={{ marginRight: 8 }} />
                          <span>FTP Connectivity</span>
                        </div>
                      } 
                      style={{ borderRadius: 6 }}
                    >
                      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                        Real-time FTP connection monitoring
                      </Text>
                      
                      <Row gutter={[16, 16]}>
                        {ftpServers.map((server, index) => (
                          <Col xs={24} md={12} key={index}>
                            <div 
                              style={{ 
                                padding: 16, 
                                background: '#f8f9fa', 
                                borderRadius: 6,
                                border: '1px solid #e8e8e8',
                                height: '100%'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Text strong style={{ fontSize: '16px' }}>{server.name}</Text>
                                <Tag 
                                  color={
                                    server.status === 'connected' ? 'green' : 
                                    server.status === 'uploading' ? 'blue' : 
                                    server.status === 'standby' ? 'orange' :
                                    server.status === 'error' ? 'red' : 'default'
                                  }
                                  icon={
                                    server.status === 'connected' || server.status === 'uploading' ? 
                                    <CheckCircleOutlined /> : 
                                    server.status === 'standby' ? <ClockCircleOutlined /> :
                                    <CloseCircleOutlined />
                                  }
                                  style={{ fontSize: '12px', padding: '4px 8px' }}
                                >
                                  {server.status.toUpperCase()}
                                </Tag>
                              </div>
                              
                              <div style={{ marginBottom: 8 }}>
                                <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#1890ff', fontFamily: 'monospace' }}>
                                  {server.ip || '0.0.0.0'}
                                </Text>
                              </div>
                              
                              <div>
                                <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                                  {server.details}
                                </Text>
                                <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginTop: 4 }}>
                                  <ClockCircleOutlined /> Last: {server.lastActivity}
                                </Text>
                              </div>
                            </div>
                          </Col>
                        ))}
                      </Row>
                    </Card>
                  </Col>
                </Row>
              </Card>
            </Col>
            
            {/* Recent Activity */}
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
                        padding: '12px 24px',
                        borderBottom: '1px solid #f0f0f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <Text strong style={{ display: 'block', fontSize: '14px' }}>
                          Container: {scan.container_no}
                        </Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          Truck: {scan.truck_no || 'N/A'}
                        </Text>
                        <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginTop: 4 }}>
                          <CalendarOutlined /> {new Date(scan.scan_time).toLocaleString()}
                        </Text>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Tag 
                          color={scan.status === 'OK' ? 'green' : 'red'}
                          style={{ fontSize: '12px', marginBottom: 4 }}
                        >
                          {scan.status}
                        </Tag>
                        <br />
                        <Text type="secondary" style={{ fontSize: '10px' }}>
                          ID: {scan.id}
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
                    value={systemActivity.successRate || okPercentage}
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
                        <FileOutlined style={{ marginRight: 4 }} />
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