import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Typography, Spin, Card, Row, Col, Statistic, Alert, Button,
  Progress, Tag, Divider, Empty
} from 'antd';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, 
  BarChartOutlined, RiseOutlined, CalendarOutlined 
} from '@ant-design/icons';

const { Title, Text } = Typography;

// Warna untuk chart
const COLORS = ['#82ca9d', '#ff4d4f', '#8884d8', '#ffc658'];

const Statistics = () => {
  const [statsData, setStatsData] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchAllStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Fetching statistics data...');
      
      // Fetch data harian dan summary secara paralel
      const [dailyResponse, summaryResponse] = await Promise.all([
        axios.get('http://localhost:5000/api/stats/daily'),
        axios.get('http://localhost:5000/api/stats/summary')
      ]);
      
      // Format data untuk daily chart
      const formattedData = dailyResponse.data.map(item => ({
        ...item,
        date: new Date(item.date).toLocaleDateString('id-ID', { 
          day: '2-digit', 
          month: 'short' 
        }),
        ok: parseInt(item.ok_count, 10),
        nok: parseInt(item.nok_count, 10),
        total: parseInt(item.total_count, 10)
      })).reverse(); // Reverse untuk urutan tanggal dari kiri ke kanan
      
      setStatsData(formattedData);
      setSummaryData(summaryResponse.data);
      
      console.log('✅ Statistics data loaded successfully:', {
        dailyRecords: formattedData.length,
        summary: summaryResponse.data
      });
      
    } catch (err) {
      console.error("❌ Gagal mengambil data statistik", err);
      setError("Tidak dapat memuat data statistik. Pastikan server berjalan.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAllStats();
  };

  useEffect(() => {
    fetchAllStats();
  }, []);

  if (loading) {
    return (
      <div style={{ 
        textAlign: 'center', 
        marginTop: '50px',
        padding: '50px' 
      }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Memuat data statistik...</Text>
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

  // Data untuk pie chart
  const pieData = summaryData ? [
    { name: 'OK', value: summaryData.overall.ok, color: '#82ca9d' },
    { name: 'NOK', value: summaryData.overall.nok, color: '#ff4d4f' }
  ] : [];

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
            <BarChartOutlined /> Statistics & Analytics
          </Title>
          <Text type="secondary">
            Comprehensive scan data analysis and performance metrics
          </Text>
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

      {/* Summary Cards */}
      {summaryData && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Scans"
                value={summaryData.overall.total}
                prefix={<BarChartOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                All time records
              </Text>
            </Card>
          </Col>
          
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Success Rate"
                value={summaryData.successRate}
                suffix="%"
                prefix={<RiseOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
              <Progress 
                percent={parseFloat(summaryData.successRate)} 
                size="small" 
                status="active"
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
              />
            </Card>
          </Col>
          
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Today's Scans"
                value={summaryData.today.total}
                prefix={<CalendarOutlined />}
                valueStyle={{ color: '#fa8c16' }}
              />
              <div style={{ marginTop: 8 }}>
                <Tag color="green" icon={<CheckCircleOutlined />}>
                  OK: {summaryData.today.ok}
                </Tag>
                <Tag color="red" icon={<CloseCircleOutlined />}>
                  NOK: {summaryData.today.nok}
                </Tag>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[24, 24]}>
        {/* Daily Scan Chart */}
        <Col xs={24} lg={16}>
          <Card 
            title={
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <BarChartOutlined style={{ marginRight: 8 }} />
                <span>Daily Scan Transactions (Last 30 Days)</span>
              </div>
            }
            style={{ borderRadius: 8 }}
          >
            {statsData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={statsData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [value, name === 'ok' ? 'OK' : 'NOK']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend />
                  <Bar 
                    dataKey="ok" 
                    name="OK" 
                    fill="#82ca9d" 
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar 
                    dataKey="nok" 
                    name="NOK" 
                    fill="#ff4d4f" 
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty 
                description="No scan data available for the last 30 days"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
          </Card>
        </Col>

        {/* Pie Chart & Additional Stats */}
        <Col xs={24} lg={8}>
          <Row gutter={[16, 16]}>
            {/* Distribution Pie Chart */}
            <Col xs={24}>
            <Card title="Scan Distribution" style={{ borderRadius: 8 }}>
                {summaryData && (
                <div style={{ padding: '16px' }}>
                    <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    marginBottom: 8 
                    }}>
                    <Text strong>OK Scans</Text>
                    <Text strong>{summaryData.overall.ok}</Text>
                    </div>
                    <Progress 
                    percent={summaryData.successRate} 
                    strokeColor="#52c41a"
                    showInfo={false}
                    style={{ marginBottom: 20 }}
                    />
                    
                    <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    marginBottom: 8 
                    }}>
                    <Text strong>NOK Scans</Text>
                    <Text strong>{summaryData.overall.nok}</Text>
                    </div>
                    <Progress 
                    percent={100 - summaryData.successRate} 
                    strokeColor="#ff4d4f"
                    showInfo={false}
                    />
                    
                    <div style={{ 
                    textAlign: 'center', 
                    marginTop: 16, 
                    padding: '8px',
                    background: '#f0f8ff',
                    borderRadius: 6
                    }}>
                    <Text strong>Success Rate: {summaryData.successRate}%</Text>
                    </div>
                </div>
                )}
            </Card>
            </Col>

            {/* Weekly Summary */}
            {summaryData && (
              <Col xs={24}>
                <Card 
                  title="This Week Summary"
                  style={{ borderRadius: 8 }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <Statistic
                      title="Total Scans"
                      value={summaryData.week.total}
                      valueStyle={{ color: '#1890ff', fontSize: '32px' }}
                    />
                    <div style={{ marginTop: 16 }}>
                      <Row gutter={[8, 8]}>
                        <Col span={12}>
                          <div style={{ textAlign: 'center' }}>
                            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '24px' }} />
                            <div style={{ fontWeight: 'bold', color: '#52c41a' }}>
                              {summaryData.week.ok}
                            </div>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              Successful
                            </Text>
                          </div>
                        </Col>
                        <Col span={12}>
                          <div style={{ textAlign: 'center' }}>
                            <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: '24px' }} />
                            <div style={{ fontWeight: 'bold', color: '#ff4d4f' }}>
                              {summaryData.week.nok}
                            </div>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              Failed
                            </Text>
                          </div>
                        </Col>
                      </Row>
                    </div>
                  </div>
                </Card>
              </Col>
            )}
          </Row>
        </Col>
      </Row>

      {/* Trend Line Chart */}
      {statsData.length > 0 && (
        <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
          <Col xs={24}>
            <Card 
              title="Scan Trend (Last 30 Days)"
              style={{ borderRadius: 8 }}
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={statsData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="total" 
                    stroke="#8884d8" 
                    name="Total Scans"
                    strokeWidth={2}
                    dot={{ fill: '#8884d8', strokeWidth: 2, r: 4 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="ok" 
                    stroke="#82ca9d" 
                    name="OK Scans"
                    strokeWidth={2}
                    dot={{ fill: '#82ca9d', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default Statistics;