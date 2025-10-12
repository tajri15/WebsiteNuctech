import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Typography, Spin, Card, Row, Col } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const { Title } = Typography;

const Statistics = () => {
    const [statsData, setStatsData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await axios.get('http://localhost:5000/api/stats/daily');
                // Format data agar bisa dibaca oleh Recharts dan urutkan dari tanggal terlama
                const formattedData = response.data.map(item => ({
                    ...item,
                    date: new Date(item.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
                    ok: parseInt(item.ok_count, 10),
                    nok: parseInt(item.nok_count, 10),
                })).reverse(); // Reverse agar grafik menampilkan tanggal dari kiri ke kanan
                setStatsData(formattedData);
            } catch (err) {
                console.error("Gagal mengambil data statistik", err);
                setError("Tidak dapat memuat data statistik.");
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) {
        return <div style={{ textAlign: 'center', marginTop: '50px' }}><Spin size="large" /></div>;
    }

    if (error) {
        return <Title level={4} style={{ textAlign: 'center', color: 'red' }}>{error}</Title>;
    }

    return (
        <div>
            <Title level={2}>Statistics - Daily Scans</Title>
            <Row>
                <Col span={24}>
                    <Card title="Scan Transactions (Last 30 Days)">
                        <ResponsiveContainer width="100%" height={400}>
                            <BarChart
                                data={statsData}
                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="ok" stackId="a" fill="#82ca9d" name="OK" />
                                <Bar dataKey="nok" stackId="a" fill="#ff4d4f" name="NOK" />
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Statistics;