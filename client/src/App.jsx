import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography, ConfigProvider, Divider } from 'antd';
import {
  DesktopOutlined,
  PieChartOutlined,
  FileTextOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import 'antd/dist/reset.css';

// Import logo
import nuctechLogo from './assets/logo.png';

// Import pages
import Overview from './pages/Overview';
import DetailLogAll from './pages/DetailLogAll';
import DetailLogOk from './pages/DetailLogOk';
import DetailLogNok from './pages/DetailLogNok';
import Statistics from './pages/Statistics';
import Settings from './pages/Settings';

const { Header, Content, Footer, Sider } = Layout;
const { Title, Text } = Typography;

function AppContent() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

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
    { 
      key: '1', 
      icon: <DesktopOutlined />, 
      label: <Link to="/">Overview</Link> 
    },
    { 
      key: '2', 
      icon: <FileTextOutlined />, 
      label: <Link to="/log/all">Detail Log All</Link> 
    },
    { 
      key: '3', 
      icon: <CheckCircleOutlined />, 
      label: <Link to="/log/ok">Detail Log OK</Link> 
    },
    { 
      key: '4', 
      icon: <CloseCircleOutlined />, 
      label: <Link to="/log/nok">Detail Log NOK</Link> 
    },
    { 
      key: '5', 
      icon: <PieChartOutlined />, 
      label: <Link to="/statistics">Statistics</Link> 
    },
    { 
      key: '6', 
      icon: <SettingOutlined />, 
      label: <Link to="/settings">Settings</Link> 
    },
  ];

  // Komponen Logo dengan styling yang diperbaiki
  const LogoImage = ({ size = 'medium', style = {} }) => (
    <img 
      src={nuctechLogo}
      alt="Nuctech Logo"
      style={{
        width: size === 'small' ? '20px' : size === 'medium' ? '32px' : '48px',
        height: size === 'small' ? '20px' : size === 'medium' ? '32px' : '48px',
        borderRadius: '4px',
        objectFit: 'contain',
        // HAPUS background putih dan padding
        backgroundColor: 'transparent',
        padding: '0',
        ...style,
      }}
      onError={(e) => {
        console.error('Gagal memuat logo');
      }}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh', width: '100vw' }}>
      <Sider 
        collapsible 
        collapsed={collapsed} 
        onCollapse={setCollapsed}
        width={280}
        style={{
          background: '#001529',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 1000,
          overflow: 'auto',
        }}
      >
        {/* Header Sidebar dengan Logo dan Deskripsi */}
        <div style={{
          padding: '20px 16px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          {/* Logo Area */}
          <div style={{
            marginBottom: '12px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: collapsed ? 'column' : 'row',
          }}>
            <LogoImage 
              size={collapsed ? 'medium' : 'large'} 
              style={{
                marginRight: collapsed ? 0 : '12px',
                marginBottom: collapsed ? '8px' : 0,
                // Pastikan tidak ada background di sini juga
                background: 'transparent',
              }}
            />
            
            {!collapsed && (
              <div style={{ textAlign: 'left' }}>
                <Title 
                  level={4} 
                  style={{ 
                    color: 'white', 
                    margin: 0, 
                    fontSize: '18px',
                    fontWeight: 'bold'
                  }}
                >
                  Nuctech
                </Title>
                <Text 
                  style={{ 
                    color: 'rgba(255, 255, 255, 0.7)', 
                    fontSize: '12px' 
                  }}
                >
                  Company Limited
                </Text>
              </div>
            )}
          </div>

          {/* Deskripsi Aplikasi */}
          {!collapsed && (
            <>
              <Divider style={{ 
                margin: '12px 0', 
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)'
              }} />
              <div style={{
                background: 'rgba(24, 144, 255, 0.1)',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(24, 144, 255, 0.3)',
              }}>
                <Text style={{ 
                  color: 'rgba(255, 255, 255, 0.9)', 
                  fontSize: '11px',
                  lineHeight: '1.4',
                  display: 'block'
                }}>
                  <strong>Transmission Monitoring System</strong>
                </Text>
                <Text style={{ 
                  color: 'rgba(255, 255, 255, 0.6)', 
                  fontSize: '10px',
                  lineHeight: '1.3',
                  display: 'block',
                  marginTop: '4px'
                }}>
                  Real-time container scanning data visualization and analysis
                </Text>
              </div>
            </>
          )}

          {/* Versi Collapsed */}
          {collapsed && (
            <div style={{
              background: 'rgba(24, 144, 255, 0.1)',
              padding: '6px',
              borderRadius: '4px',
              marginTop: '8px',
            }}>
              <Text style={{ 
                color: 'rgba(255, 255, 255, 0.9)', 
                fontSize: '9px',
                lineHeight: '1.2',
                display: 'block'
              }}>
                Nuctech
              </Text>
            </div>
          )}
        </div>

        {/* Menu Navigation */}
        <Menu 
          theme="dark" 
          selectedKeys={getSelectedKeys()} 
          mode="inline" 
          items={menuItems}
          style={{
            borderRight: 0,
            background: 'transparent',
            marginTop: '8px',
          }}
        />
      </Sider>
      
      <Layout style={{ 
        marginLeft: collapsed ? 80 : 280,
        transition: 'margin-left 0.2s',
        minHeight: '100vh'
      }}>
        <Header style={{ 
          padding: '0 24px', 
          background: '#fff', 
          boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          display: 'flex', 
          alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 999,
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <LogoImage 
              size="medium" 
              style={{ 
                marginRight: '12px',
                background: 'transparent',
              }} 
            />
            <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
              Nuctech Transmission Dashboard Monitoring 
            </Title>
          </div>
        </Header>
        
        <Content style={{ 
          padding: '24px',
          background: '#f0f2f5',
          minHeight: 'calc(100vh - 64px)'
        }}>
          <div style={{ 
            background: '#ffffff', 
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            minHeight: 'calc(100vh - 112px)'
          }}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/log/all" element={<DetailLogAll />} />
              <Route path="/log/ok" element={<DetailLogOk />} />
              <Route path="/log/nok" element={<DetailLogNok />} />
              <Route path="/statistics" element={<Statistics />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </Content>
        
        <Footer style={{ 
          textAlign: 'center', 
          background: '#fafafa',
          borderTop: '1px solid #f0f0f0',
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            background: 'transparent',
          }}>
            <LogoImage 
              size="small" 
              style={{ 
                marginRight: '8px',
                background: 'transparent',
              }} 
            />
            <Text style={{ background: 'transparent' }}>
              Nuctech Transmission Dashboard ©{new Date().getFullYear()} Made by Tajri Ramal Muzi
            </Text>
          </div>
        </Footer>
      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <Router>
        <AppContent />
      </Router>
    </ConfigProvider>
  );
}

export default App;