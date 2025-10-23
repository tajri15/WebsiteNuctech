import React from 'react';
import DetailLogTable from '../components/DetailLogTable';
import { Typography, Card, Tag } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const DetailLogOk = () => {
  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      {/* Header Section */}
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0, color: '#52c41a', display: 'flex', alignItems: 'center' }}>
          <CheckCircleOutlined style={{ marginRight: 12, fontSize: '32px' }} />
          Detail Log - OK Transactions
        </Title>
        <Text type="secondary" style={{ fontSize: '16px', marginTop: 8, display: 'block' }}>
          Successful scanning transactions with complete data transmission
        </Text>
      </div>

      {/* Status Badge */}
      <Card 
        style={{ 
          marginBottom: 24,
          borderRadius: 12,
          border: '1px solid #d9d9d9',
          background: '#f6ffed'
        }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Text strong style={{ fontSize: '16px' }}>Current Filter:</Text>
            <Tag 
              color="green" 
              style={{ 
                marginLeft: 12, 
                fontSize: '14px', 
                padding: '4px 12px',
                borderRadius: '20px'
              }}
            >
              OK TRANSACTIONS ONLY
            </Tag>
          </div>
          <Text type="secondary" style={{ fontSize: '14px' }}>
            Showing only successful transactions with resend capability
          </Text>
        </div>
      </Card>

      {/* Main Content - Tanpa prop showTransmissionFilter (default: false) */}
      <Card 
        style={{ 
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          border: 'none'
        }}
        bodyStyle={{ padding: 0 }}
      >
        <DetailLogTable filterStatus="ok" />
      </Card>
    </div>
  );
};

export default DetailLogOk;