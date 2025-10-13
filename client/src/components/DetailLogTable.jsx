import React, { useState, useEffect } from 'react';
import { Table, Tag, Modal, Image, Button, Input, Space, Card, Typography, Select, Row, Col } from 'antd';
import axios from 'axios';
import { EyeOutlined, SearchOutlined, ExportOutlined, SyncOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

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
  const [searchText, setSearchText] = useState('');
  const [logType, setLogType] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchData = async (params = {}) => {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:5000/api/scans', {
        params: {
          status: filterStatus === 'all' ? undefined : filterStatus,
          page: params.current,
          pageSize: params.pageSize,
          search: searchText || undefined,
          logType: logType === 'all' ? undefined : logType,
          statusFilter: statusFilter === 'all' ? undefined : statusFilter,
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
  }, [filterStatus, searchText, logType, statusFilter]);

  const handleTableChange = (newPagination) => {
    fetchData(newPagination);
  };

  const handleSearch = (value) => {
    setSearchText(value);
  };

  const handleRefresh = () => {
    fetchData({ current: 1, pageSize: 10 });
  };

  const handleExport = () => {
    // Implementasi export functionality
    console.log('Export functionality');
  };

  const showImageModal = (record) => {
    setSelectedRecord(record);
    setIsModalVisible(true);
  };

  const columns = [
    {
      title: 'NO.',
      key: 'no',
      width: 60,
      render: (_, record, index) => {
        const current = pagination.current || 1;
        const pageSize = pagination.pageSize || 10;
        return (current - 1) * pageSize + index + 1;
      },
    },
    {
      title: 'ID SCAN',
      dataIndex: 'id',
      key: 'id',
      width: 200,
      render: (text) => (
        <Text style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {text}
        </Text>
      ),
    },
    {
      title: 'NO. CONTAINER',
      dataIndex: 'container_no',
      key: 'container_no',
      width: 150,
      render: (text) => (
        <Text strong style={{ color: '#1890ff' }}>
          {text}
        </Text>
      ),
    },
    {
      title: 'JAM SCAN',
      dataIndex: 'scan_time',
      key: 'scan_time',
      width: 120,
      render: (text) => (
        <Text style={{ fontSize: '12px' }}>
          {text ? new Date(text).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }) : '-'}
        </Text>
      ),
      sorter: (a, b) => new Date(a.scan_time) - new Date(b.scan_time),
    },
    {
      title: 'SCAN TIME',
      dataIndex: 'scan_time',
      key: 'scan_time_full',
      width: 180,
      render: (text) => (
        <Text style={{ fontSize: '12px' }}>
          {text ? new Date(text).toLocaleString('id-ID', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }) : '-'}
        </Text>
      ),
    },
    {
      title: 'UPDATE TIME',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (text) => (
        <Text style={{ fontSize: '12px' }}>
          {text ? new Date(text).toLocaleString('id-ID', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }) : '-'}
        </Text>
      ),
    },
    {
      title: 'JUMLAH GAMBAR',
      key: 'image_count',
      width: 120,
      render: (_, record) => {
        const count = [
          record.image1_path,
          record.image2_path,
          record.image3_path,
          record.image4_path
        ].filter(Boolean).length;
        return (
          <Tag color="blue" style={{ textAlign: 'center', minWidth: '30px' }}>
            {count}
          </Tag>
        );
      },
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag 
          color={status === 'OK' ? 'green' : 'red'} 
          style={{ 
            fontWeight: 'bold',
            textAlign: 'center',
            minWidth: '50px'
          }}
        >
          {status}
        </Tag>
      ),
      filters: [
        { text: 'OK', value: 'OK' },
        { text: 'NOK', value: 'NOK' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'DETAIL',
      key: 'detail',
      width: 100,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => showImageModal(record)}
          style={{ fontSize: '12px' }}
        >
          Detail
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>


      {/* Filter Section - Layout diperbaiki */}
      <Card 
        style={{ 
          marginBottom: 16,
          borderRadius: 8,
          border: '1px solid #d9d9d9'
        }}
        styles={{ body: { padding: '16px 24px' } }}
      >
        {/* Baris 1: Label dan Dropdown */}
        <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Text strong>Pilih Transmission Log:</Text>
          </Col>
          <Col>
            <Select 
              value={logType}
              onChange={setLogType}
              style={{ width: 150 }}
            >
              <Option value="all">All Log Files</Option>
              <Option value="ok">Log OK</Option>
              <Option value="nok">Log NOK</Option>
            </Select>
          </Col>
          
          <Col>
            <Text strong>Status:</Text>
          </Col>
          <Col>
            <Select 
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 120 }}
            >
              <Option value="all">All Status</Option>
              <Option value="OK">OK</Option>
              <Option value="NOK">NOK</Option>
            </Select>
          </Col>
        </Row>

        {/* Baris 2: Search dan Tombol-tombol */}
        <Row gutter={[16, 16]} align="middle">
          <Col>
            <Text strong>Search:</Text>
          </Col>
          <Col flex="auto">
            <Search
              placeholder="Search container number, ID scan..."
              allowClear
              onSearch={handleSearch}
              style={{ width: '100%', maxWidth: 300 }}
            />
          </Col>
          
          <Col>
            <Button 
              type="primary" 
              icon={<SearchOutlined />}
              onClick={() => fetchData({ current: 1, pageSize: 10 })}
              style={{ marginRight: 8 }}
            >
              Search
            </Button>
          </Col>
          
          <Col>
            <Button 
              type="default" 
              icon={<ExportOutlined />}
              onClick={handleExport}
              style={{ marginRight: 8 }}
            >
              Export Excel
            </Button>
          </Col>
          
          <Col>
            <Button 
              type="default" 
              icon={<SyncOutlined />}
              onClick={handleRefresh}
              loading={loading}
            >
              Refresh
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Table Section */}
      <Card 
        style={{ 
          borderRadius: 8,
          border: '1px solid #d9d9d9'
        }}
        bodyStyle={{ padding: 0 }}
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `Showing ${range[0]}-${range[1]} of ${total} items`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 1300 }}
          size="middle"
          style={{ 
            borderRadius: 8,
            overflow: 'hidden'
          }}
        />
      </Card>

      {/* Image Modal */}
      {selectedRecord && (
        <Modal
          title={
            <div>
              <Text strong>Detail Images for Container: </Text>
              <Text style={{ color: '#1890ff' }}>{selectedRecord.container_no}</Text>
            </div>
          }
          visible={isModalVisible}
          onCancel={() => setIsModalVisible(false)}
          footer={null}
          width={1000}
          style={{ top: 20 }}
        >
          <Image.PreviewGroup>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-around', 
              flexWrap: 'wrap',
              gap: 16,
              padding: '16px 0'
            }}>
              {selectedRecord.image1_path && (
                <div style={{ textAlign: 'center' }}>
                  <Image 
                    width={200} 
                    height={150}
                    style={{ 
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid #d9d9d9'
                    }}
                    src={`http://localhost:5000/images${selectedRecord.image1_path}`}
                    placeholder={
                      <div style={{ 
                        width: 200, 
                        height: 150, 
                        background: '#f5f5f5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 8
                      }}>
                        <Text type="secondary">Loading...</Text>
                      </div>
                    }
                  />
                  <Text style={{ display: 'block', marginTop: 8, fontSize: '12px' }}>
                    Image 1
                  </Text>
                </div>
              )}
              {selectedRecord.image2_path && (
                <div style={{ textAlign: 'center' }}>
                  <Image 
                    width={200} 
                    height={150}
                    style={{ 
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid #d9d9d9'
                    }}
                    src={`http://localhost:5000/images${selectedRecord.image2_path}`}
                  />
                  <Text style={{ display: 'block', marginTop: 8, fontSize: '12px' }}>
                    Image 2
                  </Text>
                </div>
              )}
              {selectedRecord.image3_path && (
                <div style={{ textAlign: 'center' }}>
                  <Image 
                    width={200} 
                    height={150}
                    style={{ 
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid #d9d9d9'
                    }}
                    src={`http://localhost:5000/images${selectedRecord.image3_path}`}
                  />
                  <Text style={{ display: 'block', marginTop: 8, fontSize: '12px' }}>
                    Image 3
                  </Text>
                </div>
              )}
              {selectedRecord.image4_path && (
                <div style={{ textAlign: 'center' }}>
                  <Image 
                    width={200} 
                    height={150}
                    style={{ 
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid #d9d9d9'
                    }}
                    src={`http://localhost:5000/images${selectedRecord.image4_path}`}
                  />
                  <Text style={{ display: 'block', marginTop: 8, fontSize: '12px' }}>
                    Image 4
                  </Text>
                </div>
              )}
            </div>
          </Image.PreviewGroup>
          
          {!selectedRecord.image1_path && !selectedRecord.image2_path && 
           !selectedRecord.image3_path && !selectedRecord.image4_path && (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px 0',
              color: '#999'
            }}>
              <Text>No images available for this record</Text>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

export default DetailLogTable;