import React, { useEffect, useState } from "react";
import { PageHeader, Button, Tag, Card, Statistic, Drawer, List, Slider } from "antd";
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  StarOutlined,
  StarFilled,
  EllipsisOutlined,
} from "@ant-design/icons";
import { get } from "../utils/http";
import ws, { connect } from "../utils/websocket";

const getMarks = (item) => {
  let marks = {}
  marks[item.real_buy_price] = {
    label: <strong>{item.real_buy_price + '원'}</strong>
  }
  marks[item.real_sell_price] = {
    style: {
      color: '#50a',
    },
    label: <strong>{item.real_sell_price + '원'}</strong>
  }
  marks[item.buy_price] = {
    label:item.buy_price + '원'
  }
  return marks;
}

function Main() {
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev);
  };
  const [suggestMap, setSuggestMap] = useState({});

  useEffect(async () => {
    connect();
    const { data: suggests, status: sugStatus } = await get(
      "/stock/suggest?rate=105"
    );
    const { data: favorites, status: favStatus } = await get("/stock/favorite");
    if (sugStatus == 200 && favStatus == 200) {
      let stockMap = {};
      suggests.map((item) => {
        item["subscribe"] = favorites.includes(item.code) && true;
        stockMap[item.code] = item;
      });
      ws.send("stock/subscribe", favorites);
      setSuggestMap(stockMap);
    }

    ws.on("stock/subscribe", (data) => {
      setSuggestMap((prev) => {
        data.forEach((d) => {
          if (prev[d]) {
            prev[d].subscribe = true;
          }
        });
        return { ...prev };
      });
    });

    ws.on("stock/unsubscribe", (data) => {
      setSuggestMap((prev) => {
        data.forEach((d) => {
          if (prev[d]) {
            prev[d].subscribe = false;
          }
        });
        return { ...prev };
      });
    });

    ws.on("stock/publish", (data) => {
      setSuggestMap((prev) => {
        if(prev[data.code]) {
          prev[data.code].real_sell_price = data.real_sell_price;
          prev[data.code].real_buy_price = data.real_buy_price;
          prev[data.code].close = data.close;
        }
        return { ...prev };
      });
    });
  }, []);

  const subStock = (item) => {
    ws.send("stock/subscribe", [item.code]);
  };

  const unsubStock = (item) => {
    ws.send("stock/unsubscribe", [item.code]);
  };

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
              {React.createElement(
                collapsed ? MenuUnfoldOutlined : MenuFoldOutlined
              )}
            </Button>,
          ]}
        />
      </div>
      <div className="app-body">
        <List
          rowKey="code"
          itemLayout="horizontal"
          dataSource={Object.values(suggestMap).filter((d) => d.subscribe)}
          renderItem={(item, index) => (
            <>
              <List.Item
                actions={[
                  item.subscribe ? (
                    <StarFilled onClick={() => unsubStock(item, index)} />
                  ) : (
                    <StarOutlined onClick={() => subStock(item, index)} />
                  ),
                ]}
              >
                <List.Item.Meta
                  title={
                    <>
                      <Tag color="green">{item.code}</Tag> {item.name}
                    </>
                  }
                  description={
                    <div>
                      <p style={{ margin: 0 }}>현재가 : {item.close}원</p>
                      <p style={{ margin: 0 }}>추천일 : {item.date}</p>
                    </div>
                  }
                />
              </List.Item>
              <Slider min={item.band.lower} max={item.band.upper} range defaultValue={[item.low, item.close]} value={[item.low, item.close]} marks={getMarks(item)} />
            </>
          )}
        />
        <Drawer
          title="추천 종목"
          placement="right"
          closable={true}
          onClose={toggleCollapsed}
          visible={collapsed}
          getContainer={false}
          width={"100%"}
        >
          <List
            itemLayout="horizontal"
            dataSource={Object.values(suggestMap).filter((d) => !d.subscribe)}
            renderItem={(item, index) => (
              <List.Item
                actions={[
                  item.subscribe ? (
                    <StarFilled onClick={() => unsubStock(item, index)} />
                  ) : (
                    <StarOutlined onClick={() => subStock(item, index)} />
                  ),
                ]}
              >
                <List.Item.Meta
                  title={
                    <>
                      <Tag color="green">{item.code}</Tag> {item.name}
                    </>
                  }
                  description={
                    <div>
                      <p style={{ margin: 0 }}>추천가 : {item.buy_price}원</p>
                      <p style={{ margin: 0 }}>추천일 : {item.date}</p>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        </Drawer>
      </div>

      <div className="app-footer">
        <div
          style={{
            padding: "20px",
            background: "gray",
            textAlign: "center",
            color: "white",
          }}
        >
          <p style={{ color: "rgba(255,150,150,1)" }}>
            모든 투자의 책임은 본인에게 있습니다.
          </p>
          <p style={{ margin: 0 }}>Copyright © Vases All Rights Reserved.</p>
        </div>
      </div>
    </div>
  );
}

export default Main;
