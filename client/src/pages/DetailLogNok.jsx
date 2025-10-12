import React from 'react';
import DetailLogTable from '../components/DetailLogTable';
import { Typography } from 'antd';

const { Title } = Typography;

const DetailLogNok = () => {
  return (
    <div>
      <Title level={2}>Detail Log - NOK Transactions</Title>
      <DetailLogTable filterStatus="nok" />
    </div>
  );
};

export default DetailLogNok;