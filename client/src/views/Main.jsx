import React, { useEffect, useState } from 'react'
import { PageHeader, Button, Tag, Card, Statistic, Drawer, List } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MenuUnfoldOutlined, MenuFoldOutlined, StarOutlined, EllipsisOutlined } from '@ant-design/icons';
import { get } from '../utils/http';

function Main(props) {
  console.log(props.ws);
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = () => {
    setCollapsed(prev => !prev);
  }
  const [list, setList ] = useState([]);

  const data = [
    {
      title: '삼성전자',
      date:'2021-10-10'
    },
    {
      title: 'SK Hynics',
      date:'2021-10-20'
    },
    {
      title: '동신건설',
      date:'2021-11-10'
    },
    {
      title: '테스트',
      date:'2021-12-10'
    },
  ];

  useEffect(async () => {
    const { data, status } = await get('./stock/suggest?rate=105');
    if(status == 200) {
      setList(data);
    }
  },[])

  const addFavorite = (item) => {
    alert('스토킹 종목 등록!')
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
          width={'100%'}
        >
          <List
              itemLayout="horizontal"
              dataSource={list}
              renderItem={item => (
                <List.Item actions={[<StarOutlined onClick={() => addFavorite(item)} />]}>
                  <List.Item.Meta
                    title={item.code}
                    description={<div>{item.date}</div>}
                  />
                </List.Item>
              )}
            />
        </Drawer>
      </div>

      <div className='app-footer'>
        <div style={{padding:'20px', background:'gray', textAlign:'center', color:'white'}}>
          <p style={{color:'rgba(255,150,150,1)'}}>모든 투자의 책임은 본인에게 있습니다.</p>
          <p style={{margin:0}}>Copyright © Vases All Rights Reserved.</p>
        </div>
      </div>
    </div>
  )
}

export default Main
