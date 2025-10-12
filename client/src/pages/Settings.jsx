import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Typography, Spin, Card, Descriptions, Alert } from 'antd';
import { HddOutlined, FolderOpenOutlined, DatabaseOutlined } from '@ant-design/icons';

const { Title } = Typography;

const Settings = () => {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await axios.get('http://localhost:5000/api/config');
                setConfig(response.data);
            } catch (err) {
                console.error("Gagal mengambil data konfigurasi", err);
                setError("Tidak dapat memuat data konfigurasi dari server.");
            } finally {
                setLoading(false);
            }
        };

        fetchConfig();
    }, []);

    if (loading) {
        return <div style={{ textAlign: 'center', marginTop: '50px' }}><Spin size="large" /></div>;
    }

    if (error) {
        return <Alert message="Error" description={error} type="error" showIcon />;
    }

    return (
        <div>
            <Title level={2}>System Configuration</Title>
            <Card>
                <Descriptions bordered column={1} title="Server Settings">
                    <Descriptions.Item label={<><HddOutlined /> Log File Path</>}>
                        {config.logFilePath}
                    </Descriptions.Item>
                    <Descriptions.Item label={<><FolderOpenOutlined /> Image Folder Path</>}>
                        {config.imageFolderPath}
                    </Descriptions.Item>
                    <Descriptions.Item label={<><DatabaseOutlined /> Database Host</>}>
                        {config.databaseHost}
                    </Descriptions.Item>
                    <Descriptions.Item label={<><DatabaseOutlined /> Database Name</>}>
                        {config.databaseName}
                    </Descriptions.Item>
                </Descriptions>
                <Alert
                    message="Informasi"
                    description="Pengaturan ini bersifat hanya-baca dan diambil langsung dari konfigurasi server saat ini."
                    type="info"
                    showIcon
                    style={{ marginTop: '20px' }}
                />
            </Card>
        </div>
    );
};

export default Settings;