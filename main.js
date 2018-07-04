"use strict";
(function () {
  var margin = {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10
    },
    spider = window.location.search === '?flat' ? window.spider2 : window.spider;
  var timeDisplay = d3.select('#time');

  d3.json('data.json', function (inputData) {
    var averageSecondsBetweenStops = {};
    d3.json('turnstile-heatmap.json')
      .on('progress', function () {
        var pct = Math.round(100 * d3.event.loaded / 2787847);
        timeDisplay.text("Loading... " + pct + "%");
      })
      .get(function (error, turnstile) {
        d3.json('turnstile-gtfs-mapping.json')
          .get(function (error, turnstileToGtfs) {
            turnstile.stops.forEach(function (stop) {
              averageSecondsBetweenStops[turnstileToGtfs[stop.name]] = stop.entrancesByType.all;
            });

            var sizeScale = d3.scale.linear()
              .domain(d3.extent(d3.values(averageSecondsBetweenStops)))
              .range([2, 7]);

            inputData.nodes.forEach(function (data) {
              data.x = spider[data.id][0];
              data.y = spider[data.id][1];
            });
            inputData.links.forEach(function (link) {
              link.source = inputData.nodes[link.source];
              link.target = inputData.nodes[link.target];
            });
            console.log(inputData)
            //抓取資料 X,Y 最大值和最小值
            var xRange = d3.extent(inputData.nodes, function (d) {
              return d.x;
            });
            var yRange = d3.extent(inputData.nodes, function (d) {
              return d.y;
            });
            var outerWidth = 400,
              outerHeight = 400;
            var m = Math.min(outerWidth, outerHeight) / 20;
            margin = {
              top: m,
              right: m,
              bottom: m,
              left: m
            };
            var width = outerWidth - margin.left - margin.right,
              height = outerHeight - margin.top - margin.bottom;
            var xScale = width / (xRange[1] - xRange[0]);
            var yScale = height / (yRange[1] - yRange[0]);
            var scale = Math.min(xScale, yScale);
            //終點圓大小
            var endDotRadius = 0.2 * scale;
            inputData.nodes.forEach(function (data) {
              data.pos = [data.x * scale, data.y * scale];
            });
            d3.select('svg').remove();
            //畫主要的圖
            var svg = d3.select('#chart').append('svg')
              .attr('width', scale * xRange[1] + margin.left + margin.right)
              .attr('height', scale * yRange[1] + margin.top + margin.bottom)
              .append('g')
              .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            //浮在上方的文字名稱
            var tip = d3.tip()
              .attr('class', 'd3-tip')
              .offset([-10, 0])
              .html(function (d) {
                return d.name;
              });
            svg.call(tip);

            svg.selectAll('.station')
              .data(inputData.nodes)
              .enter()
              .append('circle')
              .style('cursor', 'pointer')
              .attr('class', function (d) {
                return 'station middle station-label ' + d.id;
              })
              .attr('cx', function (d) {
                return d.pos[0];
              })
              .attr('cy', function (d) {
                return d.pos[1];
              })
              .attr('r', function (d) {
                return sizeScale(averageSecondsBetweenStops[d.id]);
              })
              .on('mouseover', function (d) {
                //移過去顯示 站名
                if (d.pos[1] < 30) {
                  tip.direction('e')
                    .offset([0, 10]);
                } else {
                  tip.direction('n')
                    .offset([-10, 0]);
                }
                tip.show(d);
                // window.highlightMareyTitle(d.id, _.unique(d.links.map(function (link) {
                //   return link.line;
                // })));
              })
              .on('mouseout', function (d) {
                tip.hide(d);
                // window.highlightMareyTitle(null);
              });
            //中間畫線的部分
            svg.selectAll('.connect')
              .data(inputData.links)
              .enter()
              .append('line')
              .attr('class', 'connect')
              //起點x座標
              .attr('x1', function (d) {
                return d.source.pos[0];
              })
              //起點y座標
              .attr('y1', function (d) {
                return d.source.pos[1];
              })
              //終點x座標
              .attr('x2', function (d) {
                return d.target.pos[0];
              })
              //終點y座標
              .attr('y2', function (d) {
                return d.target.pos[1];
              });

            //起末站 套疊顏色
            function dot(id, clazz) {
              svg.selectAll('circle.' + id)
                .classed(clazz, true)
                .classed('end', true)
                .classed('middle', false)
                .attr('r', endDotRadius);
            }
            dot('place-asmnl', "red");
            dot('place-alfcl', "red");
            dot('place-brntn', "red");
            dot('place-wondl', "blue");
            dot('place-bomnl', "blue");
            dot('place-forhl', "orange");
            dot('place-ogmnl', "orange");
          })
      });
  });
}());