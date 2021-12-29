import React, { useEffect, useState } from 'react'
import { PageHeader, Button, Tag, Card, Statistic, Drawer, List } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MenuUnfoldOutlined, MenuFoldOutlined, StarOutlined, StarFilled, EllipsisOutlined } from '@ant-design/icons';
import { get } from '../utils/http';

function Main(props) {
  console.log(props.ws);
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = () => {
    setCollapsed(prev => !prev);
  }
  const [suggestMap, setSuggestMap ] = useState({});

  useEffect(async () => {
    const { data, status } = await get('./stock/suggest?rate=105');
    if(status == 200) {
      let stockMap = {};
      data.map((item) => {
        item['subscribe'] = false;
        stockMap[item.code] = item
      })
      setSuggestMap(stockMap);
    }
    props.ws.on('stock/subscribe', (data) => {
      setSuggestMap((prev) => {
        data.forEach((d) => {
          prev[d].subscribe = true
        })
        return {...prev};
      })
    })

    props.ws.on('stock/unsubscribe', (data) => {
      setSuggestMap((prev) => {
        data.forEach((d) => {
          prev[d].subscribe = false
        })
        return {...prev};
      })
    })
  },[])

  const subStock = (item) => {
    props.ws.send('stock/subscribe', [item.code])
  }

  const unsubStock = (item) => {
    props.ws.send('stock/unsubscribe', [item.code])
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
              dataSource={Object.values(suggestMap)}
              renderItem={(item, index) => (
                <List.Item actions={[item.subscribe ? <StarFilled onClick={() => unsubStock(item, index)} /> : <StarOutlined onClick={() => subStock(item, index)} />]}>
                  <List.Item.Meta
                    title={<><Tag color="green">{item.code}</Tag> {item.name}</>}
                    description={<div>
                      <p style={{margin:0}}>추천가 : {item.buy_price}원</p>
                      <p style={{margin:0}}>추천일 : {item.date}</p>
                    </div>}
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
