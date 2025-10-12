import React from 'react';
import DetailLogTable from '../components/DetailLogTable';
import { Typography } from 'antd';

const { Title } = Typography;

const DetailLogOk = () => {
  return (
    <div>
      <Title level={2}>Detail Log - OK Transactions</Title>
      <DetailLogTable filterStatus="ok" />
    </div>
  );
};

export default DetailLogOk;