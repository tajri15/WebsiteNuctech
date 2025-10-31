import React, { useState, useEffect } from 'react';
import DetailLogTable from '../components/DetailLogTable';
import { Typography, Card, Row, Col, Statistic, Tag, message } from 'antd';
import { FileTextOutlined, DatabaseOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import io from 'socket.io-client';

const { Title, Text } = Typography;
const socket = io('http://localhost:5000');

const DetailLogAll = () => {
    const [stats, setStats] = useState({
        total: 0,
        ok: 0,
        nok: 0,
    });
    const [lastUpdate, setLastUpdate] = useState(new Date().toLocaleString('id-ID'));

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await axios.get('http://localhost:5000/api/stats');
                setStats({
                    total: parseInt(response.data.total, 10) || 0,
                    ok: parseInt(response.data.ok, 10) || 0,
                    nok: parseInt(response.data.nok, 10) || 0,
                });
            } catch (error) {
                console.error("Gagal mengambil data statistik:", error);
            }
        };
        fetchStats();
    }, []);

    useEffect(() => {
        console.log('🔌 DetailLogAll: Setting up WebSocket listener...');
        
        const handleNewScan = (newScanData) => {
            console.log('🆕 DetailLogAll - New scan received:', newScanData.status);
            
            // ✅ PERBAIKAN DI SINI - Gunakan === 'NOK' bukan !== 'OK'
            setStats(prevStats => ({
                total: prevStats.total + 1,
                ok: prevStats.ok + (newScanData.status === 'OK' ? 1 : 0),
                nok: prevStats.nok + (newScanData.status === 'NOK' ? 1 : 0), // ← INI YANG DIPERBAIKI
            }));
            
            setLastUpdate(new Date().toLocaleString('id-ID'));
            
            // Notifikasi berdasarkan status
            if (newScanData.status === 'OK') {
                message.success(`✅ OK Scan: ${newScanData.container_no || newScanData.id_scan}`);
            } else if (newScanData.status === 'NOK') {
                message.error(`❌ NOK Scan: ${newScanData.container_no || newScanData.id_scan}`);
            }
        };

        socket.on('new_scan', handleNewScan);

        return () => {
            console.log('🔌 DetailLogAll: Cleaning up WebSocket listener...');
            socket.off('new_scan', handleNewScan);
        };
    }, []);

    const successRate = stats.total > 0 ? ((stats.ok / stats.total) * 100).toFixed(1) : 0;

    return (
        <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
            {/* Header Section */}
            <div style={{ marginBottom: 24 }}>
                <Title level={2} style={{ margin: 0, color: '#1890ff', display: 'flex', alignItems: 'center' }}>
                    <FileTextOutlined style={{ marginRight: 12, fontSize: '32px' }} />
                    Detail Log - All Transactions
                </Title>
                <Text type="secondary" style={{ fontSize: '16px', marginTop: 8, display: 'block' }}>
                    Comprehensive view of all scanning transactions and transmission logs
                </Text>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                    Success Rate: <Text strong>{successRate}%</Text> | Last Update: {lastUpdate}
                </Text>
            </div>

            {/* Statistics Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={8}>
                    <Card style={{ borderRadius: 12, background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)', border: 'none' }} bodyStyle={{ padding: '20px' }}>
                        <Statistic
                            title={<span style={{ color: 'white', fontSize: '14px' }}>TOTAL TRANSACTIONS</span>}
                            value={stats.total}
                            valueStyle={{ color: 'white', fontSize: '32px' }}
                            prefix={<DatabaseOutlined style={{ color: 'white' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card style={{ borderRadius: 12, background: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)', border: 'none' }} bodyStyle={{ padding: '20px' }}>
                        <Statistic
                            title={<span style={{ color: 'white', fontSize: '14px' }}>SUCCESSFUL SCANS</span>}
                            value={stats.ok}
                            valueStyle={{ color: 'white', fontSize: '32px' }}
                            prefix={<CheckCircleOutlined style={{ color: 'white' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card style={{ borderRadius: 12, background: 'linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)', border: 'none' }} bodyStyle={{ padding: '20px' }}>
                        <Statistic
                            title={<span style={{ color: 'white', fontSize: '14px' }}>FAILED SCANS</span>}
                            value={stats.nok}
                            valueStyle={{ color: 'white', fontSize: '32px' }}
                            prefix={<CloseCircleOutlined style={{ color: 'white' }} />}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Status Badge */}
            <Card style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #d9d9d9', background: '#fafafa' }} bodyStyle={{ padding: '16px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <Text strong style={{ fontSize: '16px' }}>Current Filter:</Text>
                        <Tag color="blue" style={{ marginLeft: 12, fontSize: '14px', padding: '4px 12px', borderRadius: '20px' }}>
                            ALL TRANSACTIONS
                        </Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: '14px' }}>
                        Real-time updates active
                    </Text>
                </div>
            </Card>

            {/* Main Content */}
            <Card style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: 'none' }} bodyStyle={{ padding: 0 }}>
                <DetailLogTable filterStatus="all" showTransmissionFilter={true} />
            </Card>
        </div>
    );
};

export default DetailLogAll;