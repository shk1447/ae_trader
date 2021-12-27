import React, { useState } from 'react'
import './App.css'
import { PageHeader, Button, Tag, Card, Statistic, Drawer, List } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MenuUnfoldOutlined, MenuFoldOutlined, StarOutlined, EllipsisOutlined } from '@ant-design/icons';

function App(props) {
  console.log(props.ws);
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = () => {
    setCollapsed(prev => !prev);
  }

  const data = [
    {
      title: 'Ant Design Title 1',
    },
    {
      title: 'Ant Design Title 2',
    },
    {
      title: 'Ant Design Title 3',
    },
    {
      title: 'Ant Design Title 4',
    },
  ];

  const addFavorite = (item) => {
    console.log(item);
  }

  return (
    <div className="App">
      <div className="app-header">
        <PageHeader
          className="site-page-header"
          onBack={false}
          title="관심 종목"
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
        <Drawer
          title="추천 종목"
          placement="right"
          closable={true}
          onClose={toggleCollapsed}
          visible={collapsed}
          getContainer={false}
          size="large"
        >
          <List
              itemLayout="horizontal"
              dataSource={data}
              renderItem={item => (
                <List.Item actions={[<StarOutlined onClick={() => addFavorite(item)} />]}>
                  <List.Item.Meta
                    title={item.title}
                    description="Ant Design, a design language for background applications, is refined by Ant UED Team"
                  />
                </List.Item>
              )}
            />
        </Drawer>
      </div>

      <div className='app-footer'>
        <div style={{padding:'10px', background:'gray', textAlign:'center', color:'white'}}>
          <p>Copyright © Vases All Rights Reserved.</p>
        </div>
      </div>
    </div>
  )
}

export default App
