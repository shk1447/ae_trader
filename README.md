## ae_trader api

### `/stcok/collect?days=1000`
> 초기 데이터 수집

### `/stcok/collect?cron=true`
> 스케쥴 데이터 수집 (월-금 : 9시 - 16시 5분에 수집시작)


### `/stock/suggest?date={date}`
> date가 없을 경우 오늘의 주식 종목 제공 (buy_price > low && buy_price < close) 이 조건일 경우 매수
> 개별 검증결과 하락중에는 매수를 피해가고, 고점일 경우에는 buy_price가 현재가보다 높게 나오기에 저가 매수가 가능.
> 120종목이 넘을 경우가 있음... power로 정렬하였기에, 위에서부터 자르면됨.

### `/stock/status?code={code}`
> 해당 종목의 상태를 제공함 (테스트 필요 - 검증 안됨)
```
buy : 매수할지 말지에 대한 상태 제공
sell_price : 매수했을 경우, 매도가 제공
status : 매도 또는 홀딩에 대한 정보 제공
```

### `/stock/test`
> 60일 기간안에 5프로 이상 친 종목들에 대한 확인을 위한 api (테스트결과 : 1000거래일에 성공확률 79프로에 평균 최대수익율은 140퍼센트)