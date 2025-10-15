import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Typography, Spin, Card, Descriptions, Alert, Tag, 
  Row, Col, Button, message, Badge
} from 'antd';
import { 
  SettingOutlined, SyncOutlined, HddOutlined, 
  FolderOpenOutlined, DatabaseOutlined, 
  CloudUploadOutlined, ApiOutlined,
  WifiOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloudServerOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

const Settings = () => {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [realTimeStatus, setRealTimeStatus] = useState({
        ftpServer: { status: 'connected', lastActivity: '-' },
        apiServer: { status: 'standby', lastActivity: '-' }
    });

    const fetchConfig = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const response = await axios.get('http://localhost:5000/api/config');
            
            if (response.data.success) {
                setConfig(response.data);
            } else {
                throw new Error('Invalid response format');
            }
            
        } catch (err) {
            console.error("Gagal mengambil data konfigurasi", err);
            setError("Tidak dapat memuat data konfigurasi dari server.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        fetchConfig();
    };

    // Real-time status updates via WebSocket
    useEffect(() => {
        const socket = new WebSocket('ws://localhost:5000');
        
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'ftp_update') {
                setRealTimeStatus({
                    ftpServer: data.ftpServer,
                    apiServer: data.apiServer
                });
            } else if (data.type === 'api_update') {
                setRealTimeStatus({
                    ftpServer: data.ftpServer,
                    apiServer: data.apiServer
                });
            } else if (data.type === 'new_scan') {
                // Update API server status when new scan is processed
                setRealTimeStatus(prev => ({
                    ...prev,
                    apiServer: {
                        status: 'processing',
                        lastActivity: new Date().toLocaleTimeString('id-ID'),
                        details: 'Processing scan data'
                    }
                }));
                
                // Set timeout to return to standby
                setTimeout(() => {
                    setRealTimeStatus(prev => ({
                        ...prev,
                        apiServer: {
                            status: 'standby',
                            lastActivity: new Date().toLocaleTimeString('id-ID'),
                            details: 'Ready for next request'
                        }
                    }));
                }, 2000);
            }
        };

        return () => socket.close();
    }, []);

    useEffect(() => {
        fetchConfig();
    }, []);

    if (loading) {
        return (
            <div style={{ textAlign: 'center', marginTop: '50px' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16 }}>
                    <Text type="secondary">Memuat konfigurasi sistem...</Text>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: '24px' }}>
                <Alert 
                    message="Error" 
                    description={error}
                    type="error" 
                    showIcon 
                    action={
                        <Button size="small" onClick={handleRefresh} loading={refreshing}>
                            Coba Lagi
                        </Button>
                    }
                />
            </div>
        );
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'connected': return 'green';
            case 'uploading': return 'blue';
            case 'processing': return 'orange';
            case 'standby': return 'default';
            default: return 'default';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'connected': return <CheckCircleOutlined />;
            case 'uploading': return <CloudUploadOutlined />;
            case 'processing': return <SyncOutlined spin />;
            case 'standby': return <ClockCircleOutlined />;
            default: return <ClockCircleOutlined />;
        }
    };

    return (
        <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ 
                marginBottom: 24, 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start' 
            }}>
                <div>
                    <Title level={2} style={{ margin: 0, color: '#1890ff' }}>
                        <SettingOutlined /> System Configuration
                    </Title>
                    <Text type="secondary">
                        Real-time server configuration and status monitoring
                    </Text>
                </div>
                <Button 
                    type="primary" 
                    icon={<SyncOutlined />} 
                    loading={refreshing}
                    onClick={handleRefresh}
                >
                    Refresh
                </Button>
            </div>

            {config && (
                <Row gutter={[24, 24]}>
                    {/* Server Configuration */}
                    <Col xs={24} lg={12}>
                        <Card 
                            title={
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <CloudServerOutlined style={{ marginRight: 8 }} />
                                    <span>Monitoring Server</span>
                                </div>
                            }
                            style={{ borderRadius: 8 }}
                            extra={
                                <Tag color="green">
                                    {config.serverEnvironment?.toUpperCase()}
                                </Tag>
                            }
                        >
                            <Descriptions bordered column={1} size="middle">
                                <Descriptions.Item label={<><HddOutlined /> Log File Path</>}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text code style={{ fontSize: '12px' }}>
                                            {config.logFilePath}
                                        </Text>
                                        <Tag color={config.logMonitoring === 'Active' ? 'green' : 'red'}>
                                            {config.logMonitoring}
                                        </Tag>
                                    </div>
                                </Descriptions.Item>
                                
                                <Descriptions.Item label={<><FolderOpenOutlined /> Image Folder</>}>
                                    <Text code style={{ fontSize: '12px' }}>
                                        {config.imageFolderPath}
                                    </Text>
                                </Descriptions.Item>
                                
                                <Descriptions.Item label="Server Port">
                                    <Text strong>{config.serverPort}</Text>
                                </Descriptions.Item>
                                
                                <Descriptions.Item label="Log File Size">
                                    <Text strong>{config.logFileSize}</Text>
                                </Descriptions.Item>
                                
                                <Descriptions.Item label="Server Uptime">
                                    <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                                        {config.serverUptime}
                                    </Tag>
                                </Descriptions.Item>
                                
                                <Descriptions.Item label="Active Connections">
                                    <Badge count={config.websocketConnections} showZero color='#52c41a'>
                                        <Tag color="orange">WebSocket Connections</Tag>
                                    </Badge>
                                </Descriptions.Item>
                            </Descriptions>
                        </Card>
                    </Col>

                    {/* Database Configuration */}
                    <Col xs={24} lg={12}>
                        <Card 
                            title={
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <DatabaseOutlined style={{ marginRight: 8 }} />
                                    <span>Database Configuration</span>
                                </div>
                            }
                            style={{ borderRadius: 8 }}
                        >
                            <Descriptions bordered column={1} size="middle">
                                <Descriptions.Item label="Database Host">
                                    <Text strong>{config.databaseHost}</Text>
                                </Descriptions.Item>
                                
                                <Descriptions.Item label="Database Port">
                                    <Text strong>{config.databasePort}</Text>
                                </Descriptions.Item>
                                
                                <Descriptions.Item label="Database Name">
                                    <Text strong>{config.databaseName}</Text>
                                </Descriptions.Item>
                                
                                <Descriptions.Item label="Database User">
                                    <Text strong>{config.databaseUser}</Text>
                                </Descriptions.Item>
                                
                                <Descriptions.Item label="Active Processes">
                                    <Text>{config.activeProcesses}</Text>
                                </Descriptions.Item>
                            </Descriptions>
                        </Card>
                    </Col>

                    {/* FTP Server & API Server */}
                    <Col xs={24}>
                        <Card 
                            title={
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <WifiOutlined style={{ marginRight: 8 }} />
                                    <span>Server Connections - Real Time</span>
                                </div>
                            }
                            style={{ borderRadius: 8 }}
                        >
                            <Row gutter={[16, 16]}>
                                {/* FTP Server */}
                                <Col xs={24} md={12}>
                                    <Card 
                                        size="small" 
                                        title={
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span>
                                                    <CloudUploadOutlined style={{ marginRight: 8 }} />
                                                    FTP Server
                                                </span>
                                                <Tag 
                                                    color={getStatusColor(realTimeStatus.ftpServer.status)}
                                                    icon={getStatusIcon(realTimeStatus.ftpServer.status)}
                                                >
                                                    {realTimeStatus.ftpServer.status.toUpperCase()}
                                                </Tag>
                                            </div>
                                        }
                                        style={{ 
                                            background: '#f0f8ff',
                                            border: '1px solid #1890ff'
                                        }}
                                    >
                                        <Descriptions column={1} size="small">
                                            <Descriptions.Item label="IP Address">
                                                <Text strong style={{ color: '#1890ff', fontFamily: 'monospace' }}>
                                                    {config.ftpServer?.ip}
                                                </Text>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Type">
                                                <Tag color="blue">{config.ftpServer?.type}</Tag>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Description">
                                                <Text type="secondary">{config.ftpServer?.description}</Text>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Activities">
                                                <div>
                                                    {config.ftpServer?.activities?.map((activity, index) => (
                                                        <Tag key={index} color="cyan" style={{ marginBottom: 4 }}>
                                                            {activity}
                                                        </Tag>
                                                    ))}
                                                </div>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Current Activity">
                                                <Text type="secondary" style={{ fontStyle: 'italic' }}>
                                                    {realTimeStatus.ftpServer.details || 'Monitoring...'}
                                                </Text>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Last Activity">
                                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                                    {realTimeStatus.ftpServer.lastActivity}
                                                </Text>
                                            </Descriptions.Item>
                                        </Descriptions>
                                    </Card>
                                </Col>
                                
                                {/* API Server */}
                                <Col xs={24} md={12}>
                                    <Card 
                                        size="small" 
                                        title={
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span>
                                                    <ApiOutlined style={{ marginRight: 8 }} />
                                                    API Server
                                                </span>
                                                <Tag 
                                                    color={getStatusColor(realTimeStatus.apiServer.status)}
                                                    icon={getStatusIcon(realTimeStatus.apiServer.status)}
                                                >
                                                    {realTimeStatus.apiServer.status.toUpperCase()}
                                                </Tag>
                                            </div>
                                        }
                                        style={{ 
                                            background: '#f6ffed',
                                            border: '1px solid #52c41a'
                                        }}
                                    >
                                        <Descriptions column={1} size="small">
                                            <Descriptions.Item label="IP Address">
                                                <Text strong style={{ color: '#52c41a', fontFamily: 'monospace' }}>
                                                    {config.apiServer?.ip}
                                                </Text>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Type">
                                                <Tag color="green">{config.apiServer?.type}</Tag>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Description">
                                                <Text type="secondary">{config.apiServer?.description}</Text>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Activities">
                                                <div>
                                                    {config.apiServer?.activities?.map((activity, index) => (
                                                        <Tag key={index} color="lime" style={{ marginBottom: 4 }}>
                                                            {activity}
                                                        </Tag>
                                                    ))}
                                                </div>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Current Activity">
                                                <Text type="secondary" style={{ fontStyle: 'italic' }}>
                                                    {realTimeStatus.apiServer.details || 'Ready...'}
                                                </Text>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Last Activity">
                                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                                    {realTimeStatus.apiServer.lastActivity}
                                                </Text>
                                            </Descriptions.Item>
                                        </Descriptions>
                                    </Card>
                                </Col>
                            </Row>
                        </Card>
                    </Col>
                </Row>
            )}

            {/* Information Alert */}
            <Alert
                message="Real-time Monitoring Information"
                description={
                    <div>
                        <p><strong>FTP Server:</strong> Bertugas mengupload file gambar ke server. Status berubah menjadi 'uploading' saat proses upload.</p>
                        <p><strong>API Server:</strong> Bertugas menerima data JSON scan dan memberikan response. Status berubah menjadi 'processing' saat memproses data.</p>
                        <p>Status diperbarui secara real-time melalui WebSocket connection.</p>
                    </div>
                }
                type="info"
                showIcon
                style={{ marginTop: '24px', borderRadius: 8 }}
            />
        </div>
    );
};

export default Settings;