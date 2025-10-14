import React from 'react';
import DetailLogTable from '../components/DetailLogTable';
import { Typography, Card, Row, Col, Statistic, Tag, Alert } from 'antd';
import { CloseCircleOutlined, ExclamationCircleOutlined, WarningOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const DetailLogNok = () => {
  const failureRate = 13.3;

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      {/* Header Section */}
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0, color: '#ff4d4f', display: 'flex', alignItems: 'center' }}>
          <CloseCircleOutlined style={{ marginRight: 12, fontSize: '32px' }} />
          Detail Log - NOK Transactions
        </Title>
        <Text type="secondary" style={{ fontSize: '16px', marginTop: 8, display: 'block' }}>
          Failed scanning transactions requiring attention and review
        </Text>
      </div>

      {/* Status Badge */}
      <Card 
        style={{ 
          marginBottom: 24,
          borderRadius: 12,
          border: '1px solid #ffccc7',
          background: '#fff2f0'
        }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Text strong style={{ fontSize: '16px', color: '#cf1322' }}>Current Filter:</Text>
            <Tag 
              color="red" 
              style={{ 
                marginLeft: 12, 
                fontSize: '14px', 
                padding: '4px 12px',
                borderRadius: '20px'
              }}
            >
              NOK TRANSACTIONS ONLY
            </Tag>
          </div>
          <Text type="secondary" style={{ fontSize: '14px' }}>
            Requires immediate attention and resolution
          </Text>
        </div>
      </Card>

      {/* Main Content */}
      <Card 
        style={{ 
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          border: 'none'
        }}
        bodyStyle={{ padding: 0 }}
      >
        <DetailLogTable filterStatus="nok" />
      </Card>
    </div>
  );
};

export default DetailLogNok;