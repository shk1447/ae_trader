import React, { useState } from 'react'
import './App.css'
import { PageHeader, Button, Tag, Card, Statistic, Drawer } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MenuUnfoldOutlined, MenuFoldOutlined } from '@ant-design/icons';

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = () => {
    setCollapsed(prev => !prev);
  }
  return (
    <div className="App">
      <div className="app-header">
        <PageHeader
          className="site-page-header"
          onBack={false}
          title="STOCKER"
          subTitle="beta version"
          tags={<Tag color="blue">Stocking</Tag>}
          extra={[
            <Button shape="round" onClick={toggleCollapsed}>
              {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined)}
            </Button>
          ]}
        />
      </div>
      <div className="app-body">
        <Card>
          <Statistic
            title="삼성전자"
            value={11.28}
            precision={2}
            valueStyle={{ color: '#3f8600' }}
            prefix={<ArrowUpOutlined />}
            suffix="%"
          />
        </Card>
        <Card>
          <Statistic
            title="삼성전자"
            value={11.28}
            precision={2}
            valueStyle={{ color: '#3f8600' }}
            prefix={<ArrowUpOutlined />}
            suffix="%"
          />
        </Card>
        <Card>
          <Statistic
            title="삼성전자"
            value={11.28}
            precision={2}
            valueStyle={{ color: '#3f8600' }}
            prefix={<ArrowUpOutlined />}
            suffix="%"
          />
        </Card>
        <Card>
          <Statistic
            title="삼성전자"
            value={11.28}
            precision={2}
            valueStyle={{ color: '#3f8600' }}
            prefix={<ArrowUpOutlined />}
            suffix="%"
          />
        </Card>
        <Card>
          <Statistic
            title="삼성전자"
            value={11.28}
            precision={2}
            valueStyle={{ color: '#3f8600' }}
            prefix={<ArrowUpOutlined />}
            suffix="%"
          />
        </Card>
        <Card>
          <Statistic
            title="삼성전자"
            value={11.28}
            precision={2}
            valueStyle={{ color: '#3f8600' }}
            prefix={<ArrowUpOutlined />}
            suffix="%"
          />
        </Card>
        <Card>
          <Statistic
            title="삼성전자"
            value={11.28}
            precision={2}
            valueStyle={{ color: '#3f8600' }}
            prefix={<ArrowUpOutlined />}
            suffix="%"
          />
        </Card>
        <Card>
          <Statistic
            title="삼성전자"
            value={11.28}
            precision={2}
            valueStyle={{ color: '#3f8600' }}
            prefix={<ArrowUpOutlined />}
            suffix="%"
          />
        </Card>
        <Card>
          <Statistic
            title="삼성전자"
            value={11.28}
            precision={2}
            valueStyle={{ color: '#3f8600' }}
            prefix={<ArrowUpOutlined />}
            suffix="%"
          />
        </Card>

        <Drawer
          title="Basic Drawer"
          placement="right"
          closable={false}
          onClose={toggleCollapsed}
          visible={collapsed}
          getContainer={true}
          style={{ position: 'absolute' }}
        >
          <p>Some contents...</p>
        </Drawer>
      </div>

      <div className='app-footer'>
        <div style={{padding:'10px', background:'gray', textAlign:'center', color:'white'}}>
          <p>aaa</p>
        </div>
      </div>
    </div>
  )
}

export default App
