import React, { useState, useEffect } from 'react';
import { Table, Tag, Modal, Image, Button } from 'antd';
import axios from 'axios';
import { EyeOutlined } from '@ant-design/icons';

const DetailLogTable = ({ filterStatus }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const fetchData = async (params = {}) => {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:5000/api/scans', {
        params: {
          status: filterStatus === 'all' ? undefined : filterStatus,
          page: params.current,
          pageSize: params.pageSize,
        },
      });
      setData(response.data.data);
      setPagination({
        ...params,
        total: response.data.total,
      });
    } catch (error) {
      console.error("Gagal mengambil data log detail:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData({ current: 1, pageSize: 10 });
  }, [filterStatus]); // Ambil data lagi jika filter berubah (misal pindah dari All ke OK)

  const handleTableChange = (newPagination) => {
    fetchData(newPagination);
  };

  const showImageModal = (record) => {
    setSelectedRecord(record);
    setIsModalVisible(true);
  };

  const columns = [
    {
      title: 'Scan Time',
      dataIndex: 'scan_time',
      key: 'scan_time',
      render: (text) => new Date(text).toLocaleString('id-ID'),
      sorter: (a, b) => new Date(a.scan_time) - new Date(b.scan_time),
    },
    {
      title: 'Container No',
      dataIndex: 'container_no',
      key: 'container_no',
    },
    {
      title: 'Truck No',
      dataIndex: 'truck_no',
      key: 'truck_no',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'OK' ? 'green' : 'red'}>{status}</Tag>
      ),
      filters: [
        { text: 'OK', value: 'OK' },
        { text: 'NOK', value: 'NOK' },
      ],
      onFilter: (value, record) => record.status.indexOf(value) === 0,
    },
    {
      title: 'Images',
      key: 'images',
      render: (_, record) => (
        <Button
          icon={<EyeOutlined />}
          onClick={() => showImageModal(record)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={pagination}
        onChange={handleTableChange}
      />
      {selectedRecord && (
        <Modal
          title={`Images for Container: ${selectedRecord.container_no}`}
          visible={isModalVisible}
          onCancel={() => setIsModalVisible(false)}
          footer={null}
          width={1000}
        >
          <Image.PreviewGroup>
            <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap' }}>
              {selectedRecord.image1_path && <Image width={200} src={`http://localhost:5000/images${selectedRecord.image1_path}`} />}
              {selectedRecord.image2_path && <Image width={200} src={`http://localhost:5000/images${selectedRecord.image2_path}`} />}
              {selectedRecord.image3_path && <Image width={200} src={`http://localhost:5000/images${selectedRecord.image3_path}`} />}
              {selectedRecord.image4_path && <Image width={200} src={`http://localhost:5000/images${selectedRecord.image4_path}`} />}
            </div>
          </Image.PreviewGroup>
        </Modal>
      )}
    </>
  );
};

export default DetailLogTable;