const SMA = require('technicalindicators').SMA

var bb =SMA.calculate({period:5, values:[1,2,3,4,5,6,7,8,9,10,11]})
console.log(bb)

var aa = new SMA({period:5, values:[1,2,3,4,5,6,7,8,9,10,11]})
console.log()
var test = new Array(4).concat(aa.result)
console.log(test.slice(6,10));