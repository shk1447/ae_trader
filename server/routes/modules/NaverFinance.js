const _ = require('lodash');
const cheerio = require('cheerio');
const axios = require('axios');
const iconv = require('iconv-lite')
const request = require('request')
const moment = require('moment')
module.exports = function () {
    var code_list = [];
    function getSise(code, days) {
        var page_num = 1;
        var req_page = parseInt(days / 10) + 1;
        var remain_row = parseInt(days % 10);
        var url = "http://finance.naver.com/item/sise_day.nhn?code={code}&page={page}";
        return new Promise((resolve, reject) => {
            async function page_req(num, code, rows) {
                try {
                    var real_url = url.replace('{code}', code).replace('{page}', num)
                    request(real_url, function (err, res, body) {
                        if (!err && res.statusCode == 200)
                            var $ = cheerio.load(body);
                        if (page_num === 1) {
                            if ($('.pgRR a').length > 0) {
                                var href = $('.pgRR a')[0].attribs.href;
                                page_num = parseInt(href.substring(href.search("page=") + 5, href.length));
                                page_num = page_num > req_page ? req_page : page_num;
                            }
                        }
                        if ($) {
                            var nodes = $('.type2 tbody tr td span');
                            var row = {};
                            var header = ["date", "close", "gap", "open", "high", "low", "volume"]

                            try {
                                for (var index = 0; index < nodes.length; index++) {
                                    var row_num = parseInt(index / 7);
                                    if (page_num === num && row_num > (remain_row - 1)) {
                                        break;
                                    }
                                    // 날짜, 종가, 전일비, 시가, 고가, 저가, 거래량
                                    var i = index % 7;
                                    var node = nodes[index];
                                    if (i == 2) continue;
                                    row[header[i]] = header[i] == 'date' ? new Date(node.firstChild.data.replace(/\n/gi, "").replace(/\t/gi, "").replace(/,/gi, "")).getTime() : parseInt(node.firstChild.data.replace(/\n/gi, "").replace(/\t/gi, "").replace(/,/gi, ""));
                                    if (i === 6) {
                                        if (row['volume'] > 0 && row['open'] > 0) {
                                            rows.unshift(row);
                                        }
                                        row = {};
                                    }
                                }
                            } catch (error) {

                            }

                            num++
                            if (num < page_num) {
                                page_req(num, code, rows);
                            } else {
                                resolve(rows)
                            }
                        } else {
                            resolve(rows)
                        }
                    }
                    );
                } catch (err) {
                    page_req(1, code, []);
                }
            }

            page_req(1, code, []);
        })
    }

    function getStockList() {
        var stock_list = [];
        var url = "http://finance.naver.com/sise/sise_market_sum.nhn?sosok={exchange}&page={pageNumber}";
        return new Promise((resolve, reject) => {
            function push_code($) {
                var nodes = $('.box_type_l .type_2 tbody tr td a[class]');
                _.each(nodes, (node, index) => {
                    var stock_name = $(node).text();
                    var stock_total = $(node.parent.parent.children[15]).text().replace(/,/g, '') + '000';
                    var stock_per = $(node.parent.parent.children[21]).text().replace(/,/g, '');
                    var stock_roe = $(node.parent.parent.children[23]).text().replace(/,/g, '');

                    let href = node.attribs.href;
                    var stock_code = href.substring(href.search("code=") + 5, href.length);
                    code_list.push(stock_code);
                    stock_list.push({
                        stock_code: stock_code,
                        stock_name: stock_name,
                        stock_total: stock_total,
                        stock_per: stock_per,
                        stock_roe: stock_roe
                    })
                })
            }
            async function init_req(k) {
                let response = await axios.get(url.replace("{pageNumber}", "1").replace("{exchange}", k.toString()), { responseEncoding: 'binary', responseType: 'arraybuffer' });
                let result = iconv.decode(response.data, 'euc-kr')

                var $ = cheerio.load(result);
                var href = $('.pgRR a')[0].attribs.href;
                var page_num = parseInt(href.substring(href.search("page=") + 5, href.length));
                push_code($);
                async function page_req(num) {
                    let response = await axios.get(url.replace("{pageNumber}", num).replace("{exchange}", k.toString()), { responseEncoding: 'binary', responseType: 'arraybuffer' })
                    let result = iconv.decode(response.data, 'euc-kr')
                    $ = cheerio.load(result);
                    push_code($);
                    num++
                    if (num <= page_num) {
                        page_req(num);
                    } else {
                        if (k === 0) init_req(1)
                        else resolve(stock_list);
                    }
                }
                page_req(2);
            }

            try {
                init_req(0);
            } catch (error) {
                reject();
            }
        })
    }

    return {
        getSise: getSise,
        getStockList: getStockList
    };
}();