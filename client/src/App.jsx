import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography } from 'antd';
import {
  DesktopOutlined,
  PieChartOutlined,
  FileTextOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import 'antd/dist/reset.css'; // Impor CSS Ant Design

// Impor halaman-halaman (kita akan buat filenya nanti)
import Overview from './pages/Overview';
// import DetailLogAll from './pages/DetailLogAll';
// import DetailLogOk from './pages/DetailLogOk';
// import DetailLogNok from './pages/DetailLogNok';
// import Statistics from './pages/Statistics';
// import Settings from './pages/Settings';

const { Header, Content, Footer, Sider } = Layout;
const { Title } = Typography;

// Komponen placeholder untuk halaman yang belum dibuat
const Placeholder = ({ title }) => <div><Title level={2}>{title}</Title><p>Halaman ini sedang dalam pengembangan.</p></div>;

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // Menentukan menu mana yang aktif berdasarkan URL
  const getSelectedKeys = () => {
    const path = location.pathname;
    if (path === '/') return ['1'];
    if (path.startsWith('/log/all')) return ['2'];
    if (path.startsWith('/log/ok')) return ['3'];
    if (path.startsWith('/log/nok')) return ['4'];
    if (path.startsWith('/statistics')) return ['5'];
    if (path.startsWith('/settings')) return ['6'];
    return ['1'];
  };

  const menuItems = [
    { key: '1', icon: <DesktopOutlined />, label: <Link to="/">Overview</Link> },
    { key: '2', icon: <FileTextOutlined />, label: <Link to="/log/all">Detail Log All</Link> },
    { key: '3', icon: <CheckCircleOutlined />, label: <Link to="/log/ok">Detail Log OK</Link> },
    { key: '4', icon: <CloseCircleOutlined />, label: <Link to="/log/nok">Detail Log NOK</Link> },
    { key: '5', icon: <PieChartOutlined />, label: <Link to="/statistics">Statistics</Link> },
    { key: '6', icon: <SettingOutlined />, label: <Link to="/settings">Settings</Link> },
  ];

  return (
      <Layout style={{ minHeight: '100vh' }}>
        <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)}>
          <div style={{ height: '32px', margin: '16px', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '6px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontWeight: 'bold' }}>
            {collapsed ? 'RSD' : 'Scanner Dashboard'}
          </div>
          <Menu theme="dark" selectedKeys={getSelectedKeys()} mode="inline" items={menuItems} />
        </Sider>
        <Layout>
          <Header style={{ padding: '0 16px', background: '#ffffff', display: 'flex', alignItems: 'center' }}>
              <Title level={3} style={{ margin: 0 }}>Realtime Container Scanner Dashboard</Title>
          </Header>
          <Content style={{ margin: '16px' }}>
            <div style={{ padding: 24, minHeight: 'calc(100vh - 180px)', background: '#ffffff', borderRadius: '8px' }}>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/log/all" element={<Placeholder title="Detail Log All" />} />
                <Route path="/log/ok" element={<Placeholder title="Detail Log OK" />} />
                <Route path="/log/nok" element={<Placeholder title="Detail Log NOK" />} />
                <Route path="/statistics" element={<Placeholder title="Statistics" />} />
                <Route path="/settings" element={<Placeholder title="Settings" />} />
              </Routes>
            </div>
          </Content>
          <Footer style={{ textAlign: 'center' }}>
            Scanner Dashboard ©{new Date().getFullYear()} Created by Ramadika
          </Footer>
        </Layout>
      </Layout>
  );
}

// Bungkus App dengan Router untuk bisa menggunakan `useLocation`
const AppWrapper = () => (
  <Router>
    <App />
  </Router>
);

export default AppWrapper;