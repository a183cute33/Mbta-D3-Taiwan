"use strict";
(function () {
  d3.selection.prototype.appendOnce = function (type, clazz) {
    var result = this.selectAll('.' + clazz.replace(/ /g, '.')).data([1]);
    result.firstTime = result.enter().append(type).attr('class', clazz);
    return result;
  };

  d3.selection.prototype.onOnce = function (eventType, subSelector, func) {
    this.each(function () {
      $(this).on(eventType, subSelector, function (evt) {
        var d = d3.select(this).datum();
        try {
          d3.event = evt.originalEvent;
          return func.call(this, d);
        } finally {
          d3.event = null;
        }
      });
    });
    return this;
  };

  spider = window.spider;
  var timeDisplay = d3.select('#time');

  d3.json('data.json', function (inputData) {
    d3.json('turnstile-heatmap.json')
      .on('progress', function () {
        var pct = Math.round(100 * d3.event.loaded / 2787847);
        timeDisplay.text("Loading... " + pct + "%");
      })
      .get(function (error, turnstile) {
        d3.json('turnstile-gtfs-mapping.json')
          .get(function (error, mappingData) {

            var averageSecondsBetweenStops = {};
            var offset = {};
            var numAnnotationLinesInTable = {};

            turnstile.stops.forEach(function (stop) {
              var name = stop.name;
              offset[name] = currentOffset;
              averageSecondsBetweenStops[mappingData[stop.name]] = stop.entrancesByType.all;
            });
            var stopToLine = {};
            inputData.links.forEach(function (link) {
              link.source = inputData.nodes[link.source];
              link.target = inputData.nodes[link.target];
              stopToLine[link.target.id] = stopToLine[link.target.id] || {};
              stopToLine[link.source.id] = stopToLine[link.source.id] || {};
              stopToLine[link.target.id][link.line] = true;
              stopToLine[link.source.id][link.line] = true;
            });

            var currentOffset = 0;
            var hourWidth = 3;
            var hourHeight = 8;
            var dayWidth = 24 * hourWidth;
            var heatmapWidth = dayWidth * 7.5 + 15;
            var heatmapHeight = hourHeight * (1 + 4 * 2) + 40;
            var heatMapMargin = {
              top: 10,
              right: 0,
              bottom: 0,
              left: 25
            };
            var dayMargin = {
              top: 0,
              right: 2,
              bottom: 2,
              left: 0
            };

            /* 3. Render the map-glyph for this section
             *************************************************************/
            var sizeScale = d3.scale.linear()
              .domain(d3.extent(d3.values(averageSecondsBetweenStops)))
              .range([2, 7]);
            var perHourSizeScale = d3.scale.sqrt()
              .domain([0, turnstile.max])
              .range([2, 7]);
            var perHourPerMinuteSizeScale = d3.scale.sqrt()
              .domain([0, turnstile.max / 60])
              .range([2, 7]);

            inputData.nodes.forEach(function (data) {
              data.x = spider[data.id][0];
              data.y = spider[data.id][1];
            });

            //抓取資料 X,Y 最大值和最小值
            var xRange = d3.extent(inputData.nodes, function (d) {
              return d.x;
            });
            var yRange = d3.extent(inputData.nodes, function (d) {
              return d.y;
            });
            var outerWidth = 600,
              outerHeight = 600;
            var m = Math.min(outerWidth, outerHeight) / 20;
            var margin = {
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
            var endDotRadius = 5 * scale; //終點圓大小
            inputData.nodes.forEach(function (data) {
              data.pos = [data.x * scale, data.y * scale];
            });
            //畫主要的圖
            var svg = d3.select('.glyph').append('svg')
              .attr('width', scale * xRange[1] + margin.left + margin.right)
              .attr('height', scale * yRange[1] + margin.top + margin.bottom)
              .append('g')
              .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            // svg.appendOnce('text', 'time-display')
            //   .attr('x', svg.attr('width') * 0.55)
            //   .attr('y', svg.attr('height') * 0.55);

            //浮在上方的文字名稱
            var tip = d3.tip()
              .attr('class', 'd3-tip text-center')
              .offset([-10, 0])
              .html(function (d) {
                return d.name + '<br>Average ' + d3.format(',.0f')(d3.round(averageSecondsBetweenStops[d.id], -2)) + ' entrances per day';
              });
            svg.call(tip);

            //中間畫線的部分
            svg.selectAll('.connect')
              .data(inputData.links)
              .enter()
              .append('line')
              .attr('class', function (d) {
                return 'connect ' + d.line;
              })
              .attr('x1', function (d) {
                return d.source.pos[0];
              })
              .attr('y1', function (d) {
                return d.source.pos[1];
              })
              .attr('x2', function (d) {
                return d.target.pos[0];
              })
              .attr('y2', function (d) {
                return d.target.pos[1];
              });

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
              .on('mouseout.tip', tip.hide)
              .on('mouseout.station', unHighlightStation)
              .on('mouseover', function (d) {
                if (d.pos[1] < 30) {
                  tip.direction('e')
                    .offset([0, 10]);
                } else {
                  tip.direction('n')
                    .offset([-10, 0]);
                }
                tip.show(d);
                highlightStation(d.id);
              })

            resetMapKey();

            dot('BR01', "#b57a25");
            //中和新蘆線
            dot('O21', "#f5a818");
            dot('O54', "#f5a818");
            dot('O01', "#f5a818");
            //松山新店線
            dot('G01', "#107547");
            dot('G19', "#107547");
            //淡水信義線
            dot('R28', "#d90023");
            dot('R02', "#d90023");
            //板南線
            dot('BL01', "#0a59ae");
            dot('BL23', "#0a59ae");
            //小碧潭
            dot('G03A', "#d2de1a");
            //新北投
            dot('R22A', "#ef9298");

            /*建立table*/
            var showingStations = {
              // 'Harvard': true,
            };

            var dragOrigin;
            var drag = d3.behavior.drag()
              .origin(function (d) {
                return d;
              })
              .on("dragstart", function (d) {
                dragOrigin = d;
              })
              .on("dragend", function () {
                dragOrigin = null;
              });

            var bottomMargin = {
              top: 20,
              right: 20,
              bottom: 10,
              left: 10
            };
            var bottomOuterWidth = 580;
            var bottomOuterHeight = 800;
            var bottomHeight = bottomOuterHeight - bottomMargin.top - bottomMargin.bottom;
            var bottomWidth = bottomOuterWidth - bottomMargin.left - bottomMargin.right;
            var stationTable = d3.select(".turnstile-table").append('svg')
              .attr('class', 'barchart')
              .attr('width', bottomOuterWidth)
              .attr('height', bottomOuterHeight)
              .append('g')
              .attr('transform', 'translate(' + bottomMargin.left + ',' + (bottomMargin.top) + ')');

            var stationTableTooltip = d3.tip()
              .attr('class', 'd3-tip text-center')
              .offset([-10, 0])
              .html(function (d) {
                return getTextForRollover(d, d3.select(this).classed('entrances') ? 'entrances' : 'exits');
              });

            stationTable.call(stationTableTooltip);

            var yScale = d3.scale.ordinal()
              .domain(turnstile.stops.map(function (d) {
                return d.name;
              }))
              .rangeRoundBands([0, bottomHeight], 0.3);

            //丟資料進去  
            var stationRows = stationTable.selectAll('.row')
              .data(turnstile.stops)
              .enter()
              .append('g')
              .attr('class', function (d) {
                return mappingData[d.name] + ' row dimmable';
              })
              .call(placeRow);

            stationRows.call(drag)
              .on('mouseover', highlightStationOrStationRange)
              .on('mouseout', unHighlightStation);

            stationRows
              .on('click', function (d) {
                showingStations[d.name] = !showingStations[d.name];
                updateShownStations(d.name);
              });

            var hourWidth = 3;
            var hourHeight = 8;
            var dayWidth = 24 * hourWidth;


            var namesLeftPx = 15;
            var weekdayHeatmapLeftPx = 120;
            var offpeakHeatmapLeftPx = weekdayHeatmapLeftPx + dayWidth + 5;
            var numWidthPx = 35;
            var barExtentPx = [offpeakHeatmapLeftPx + dayWidth + 5, bottomWidth];
            var barLenScale = d3.scale.linear()
              .domain([0, d3.max(turnstile.stops, function (d) {
                return d.entrancesByType.all;
              })])
              .range([0, barExtentPx[1] - barExtentPx[0] - 15]);

            //站名 顯示
            stationRows
              .append('text')
              .attr('x', namesLeftPx)
              .attr('y', yScale.rangeBand())
              .attr('class', 'highlight-dimmable')
              .text(function (d) {
                return d.name;
              })
              .append('title')
              .text("Click to show details below");
            var rects = stationRows
              .append('rect')
              .style('opacity', '0')
              .attr('class', 'bounding-box');

            // 繪製右邊每站的bar 長條
            stationRows.append('rect')
              .attr('class', 'bar highlight-dimmable')
              // MARGIN-LEFT 寬度
              .attr('x', barExtentPx[0])
              .attr('width', function (d) {
                return barLenScale(d.entrancesByType.all);
              })
              .attr('height', yScale.rangeBand() + 1);


            // 長條旁邊的 數字顯示
            stationRows.append('text')
              .attr('x', function (d) {
                //抓取 bar 長度 margin-left = bar 長度
                return barExtentPx[0] + barLenScale(d.entrancesByType.all);
              })
              .attr('text-anchor', 'start')
              .attr('dx', 2)
              .attr('dy', yScale.rangeBand())
              .attr('class', 'highlight-dimmable')
              .text(function (d) {
                var value = d.entrancesByType.all;
                //百位數字後省略的顯示方法(先省略)
                // var num = Math.ceil(Math.log10(value / 100));
                // return d3.format(',.' + num + 'r')(value);
                return value;
              });

            // 增加 站名前面的 線 顏色
            // var lines = ['brown', 'red', 'green', 'orange', 'blue', 'pink', 'cyan'];
            var lines = ['brown', 'red'];

            var lineDotScale = d3.scale.ordinal()
              .domain([1, 0])
              .rangePoints([0, 10]);
            stationRows.selectAll('.line')
              .data(function (d) {
                return lines.filter(function (line) {
                  if (stopToLine[mappingData[d.name]])
                    return stopToLine[mappingData[d.name]][line];
                  return line;
                });
              })
              .enter()
              .append('circle')
              .attr('r', 3)
              .attr('cx', function (d, i) {
                return lineDotScale(i);
              })
              .attr('cy', yScale.rangeBand() - 5)
              .attr('class', function (d) {
                return 'highlight-dimmable line ' + d;
              })
              .on('mouseover', function (d) {
                stationTableTooltip.html(d + ' line');
                stationTableTooltip.show(d);
              })
              .on('mouseout', stationTableTooltip.hide);


            var debounceTimeout;
            var debounceDelayMs = 100;
            //創建四個區塊
            var heatmaps = stationRows.selectAll('.heatmaps')
              .data(function (d) {
                return [{
                    parent: d,
                    type: 'entrances',
                    day: 'offpeak',
                    x: offpeakHeatmapLeftPx,
                    y: 0
                  },
                  {
                    parent: d,
                    type: 'exits',
                    day: 'offpeak',
                    x: offpeakHeatmapLeftPx,
                    y: yScale.rangeBand() / 2
                  },
                  {
                    parent: d,
                    type: 'entrances',
                    day: 'weekday',
                    x: weekdayHeatmapLeftPx,
                    y: 0
                  },
                  {
                    parent: d,
                    type: 'exits',
                    day: 'weekday',
                    x: weekdayHeatmapLeftPx,
                    y: yScale.rangeBand() / 2
                  }
                ];
              })
              .enter()
              .append('g')
              .attr('class', function (d) {
                return 'heatmap highlight-dimmable ' + d.type + ' ' + d.day;
              })
              .attr('transform', function (d) {
                return 'translate(' + d.x + ',' + d.y + ')';
              });
            //繪製 右邊疏密波
            stationRows.append('rect')
              .attr('class', 'outline')
              .attr('x', offpeakHeatmapLeftPx)
              .attr('y', 0)
              .attr('width', hourWidth * 24)
              .attr('height', yScale.rangeBand());

            //繪製 左邊疏密波
            stationRows.append('rect')
              .attr('class', 'outline')
              .attr('x', weekdayHeatmapLeftPx)
              .attr('y', 0)
              .attr('width', hourWidth * 24)
              .attr('height', yScale.rangeBand());

            // table 上方文字
            stationTable.selectAll('.dayLabel')
              .data([
                ['Station', 'start', namesLeftPx],
                ['Avg. Weekday', 'middle', weekdayHeatmapLeftPx + dayWidth / 2],
                ['Avg. Weekend', 'middle', offpeakHeatmapLeftPx + dayWidth / 2],
                ['Avg. Turnstile Entries per day', 'start', barExtentPx[0]]
              ])
              .enter()
              .append('g')
              .attr('class', 'xAxis')
              .append('text')
              .attr('class', 'dayLabel')
              .attr('x', function (d) {
                return d[2];
              })
              .attr('y', function (d) {
                return d[3] || -10;
              })
              .text(function (d) {
                return d[0];
              })
              .style('text-anchor', function (d) {
                return d[1];
              });
            // 文字與下方 之間的 一條線
            stationTable.append('line')
              .attr('class', 'border')
              .attr('x1', 0)
              .attr('x2', barExtentPx[1] + 20)
              .attr('y1', -7)
              .attr('y2', -7);
            // 6pm 12pm 6pm 文字顯示
            var dayLabels = stationTable.selectAll('.hours')
              .data([weekdayHeatmapLeftPx, offpeakHeatmapLeftPx])
              .enter()
              .append('g')
              .attr('class', 'hours xAxis');

            var hourLabelsScale = d3.scale.ordinal()
              .domain(['6am', '12pm', '6pm'])
              .rangePoints([0, dayWidth], 2.0);
            var xAxis = d3.svg.axis()
              .scale(hourLabelsScale)
              .orient('bottom');
            dayLabels
              .attr('transform', function (d) {
                return 'translate(' + d + ',-11)';
              })
              .call(xAxis);

            var positionScale = d3.scale.ordinal()
              .rangeBands([0, dayWidth], 0, 0)
              .domain(d3.range(0, 24));

            var colorScale = d3.scale.linear()
              .domain([turnstile.min, turnstile.mean || turnstile.max * 0.9, turnstile.max])
              .range(['white', 'black', 'red']);

            heatmaps.selectAll('rect')
              .data(function (d) {
                return d.parent.averagesByType[d.day].filter(function (d) {
                  return !!d;
                }).map(function (other) {
                  return {
                    hour: other.hour,
                    datum: other[d.type],
                    name: d.parent.name,
                    day: d.day,
                    type: d.type
                  };
                });
              })
              .enter().append('rect')
              .attr('x', function (d) {
                return positionScale(d.hour);
              })
              .attr('width', hourWidth)
              .attr('height', yScale.rangeBand() / 2)
              .attr('fill', function (d) {
                return colorScale(d.datum);
              }).on('mouseover', handleMouseOver)
              .on('mouseout', handlMouseOut)

            //四個區塊 滑鼠事件
            function handleMouseOver(d) {
              var time = hourToAmPm(d.hour);
              var timePlusOne = hourToAmPm((d.hour + 1) % 24);
              var gtfsId = mappingData[d.name];
              stationTable.selectAll('.row.' + gtfsId).select('.stop-heatmap').selectAll('rect.' + d.type).classed('hover', function (other) {
                return classify(other) === d.day && other.hour === d.hour;
              });
              // stationTableTooltip.html(d.name + ' from ' + time + ' to ' + timePlusOne + ' on average ' + (d.day === 'weekday' ? 'weekday' : 'weekend/holiday') + '<br>' + d3.format('.0f')(d.datum / 60) + ' ' + d.type + ' per minute');
              stationTableTooltip.html(d.name + ' from ' + time + ' to ' + timePlusOne + ' on average ' + (d.day === 'weekday' ? 'weekday' : 'weekend/holiday') + '<br>' + d3.format('.0f')(d.datum) + ' ' + d.type + ' per minute');
              stationTableTooltip.show(d);

              var updatedSizes = {};
              turnstile.stops.forEach(function (stop) {
                var datum = stop.averagesByType[d.day][d.hour];
                updatedSizes[mappingData[stop.name]] = datum ? datum[d.type] : 0;
              });
              d3.selectAll('.glyph circle')
                .attr('r', function (d) {
                  return perHourSizeScale(updatedSizes[d.id]);
                });
              drawMapKey([0, 40, 82], perHourPerMinuteSizeScale, d.type + ' on ' + (d.day === 'weekday' ? 'weekdays' : 'weekends/holidays') + ' from ' + time + ' to ' + timePlusOne, 'per minute');
            }

            function handlMouseOut(d) {
              var gtfsId = mappingData[d.name];
              stationTable.selectAll('.row.' + gtfsId).select('.stop-heatmap').selectAll('rect').classed('hover', false);
              stationTableTooltip.hide(d);
            };

            /*共用方法*/

            function highlightStationOrStationRange(d) {
              var id = mappingData[d.name];
              if (dragOrigin) {
                var a = d.entrancesByType.all;
                var b = dragOrigin.entrancesByType.all;
                var min = d3.min([a, b]);
                var max = d3.max([a, b]);
                var container = d3.select('.section-people .turnstile-viz');
                container.selectAll('.glyph').classed('highlighting', true);
                container.selectAll().classed('active', isActive);
              } else {
                highlightStation(id, true);
              }

              function isActive(other) {
                var num = averageSecondsBetweenStops[other.id || mappingData[other.name]];
                return num <= max && num >= min;
              }
            }

            function highlightStation(gtfsId, left) {
              var container = d3.select('.section-people .turnstile-viz');
              container.selectAll(left ? '.glyph' : '.turnstile-table').classed('highlighting', true);
              container.selectAll('.' + gtfsId).classed('active', true);
            }

            function unHighlightStation() {
              var container = d3.selectAll('.glyph, .turnstile-table');
              container.selectAll('.active').classed('active', false);
            }

            //起末站 套疊顏色
            function dot(id, clazz) {
              svg.selectAll('circle.' + id)
                .attr('style', 'fill:' + clazz)
                .classed('end', true)
                .classed('middle', false)
                .attr('r', endDotRadius);
            }

            function drawMapKey(sizes, sizeScale, trailer, units) {
              var margin = {
                top: 10,
                right: 30,
                bottom: 10,
                left: 10
              };
              var width = 300 - margin.left - margin.right;
              var mapKey = d3.selectAll('.glyph.circles').appendOnce('svg', 'key-container')
                .attr('width', 300)
                .attr('height', 50)
                .appendOnce('g', 'key-g')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
              var text = mapKey.appendOnce('text', 'middle-text')
                .attr('x', width / 2)
                .attr('y', 5)
                .attr('text-anchor', 'middle');
              text.text('Size shows turnstile ' + (trailer || '')).call(wrap, 250);
              var xScale = d3.scale.ordinal()
                .domain(sizes)
                .range([30, 75, 135]);
              var circles = mapKey.selectAll('circle')
                .data(sizes);
              circles
                .enter()
                .append('circle')
                .attr('class', 'station middle');
              circles
                .attr('r', function (d) {
                  return sizeScale(d);
                })
                .attr('cx', function (d) {
                  return xScale(d) - sizeScale(d) - 2;
                })
                .attr('cy', 30);
              circles.exit().remove();

              var labels = mapKey.selectAll('text.num')
                .data(sizes);
              labels
                .enter()
                .append('text')
                .attr('class', 'num');
              labels
                .text(d3.format(',.0f'))
                .attr('x', function (d) {
                  return xScale(d);
                })
                .attr('y', 35);
              labels.exit().remove();

              mapKey.appendOnce('text', 'ppl')
                .attr('text-anchor', 'start')
                .attr('x', xScale(_.last(sizes)) + 37)
                .attr('y', 35)
                .text('people ' + units);
            }

            function wrap(text, width) {
              text.each(function () {
                var text = d3.select(this),
                  words = text.text().split(/\s+/).reverse(),
                  word,
                  line = [],
                  lineNumber = 0,
                  lineHeight = 1.1, // ems
                  y = text.attr("y") || 0,
                  x = text.attr("x") || 0,
                  dy = parseFloat(text.attr("dy") || 0),
                  tspan = text.text(null).append("tspan").attr("x", x).attr("y", y).attr("dy", dy + "em");
                while (!!(word = words.pop())) {
                  line.push(word);
                  tspan.text(line.join(" "));
                  if (tspan.node().getComputedTextLength() > width || word === '<br>') {
                    line.pop();
                    tspan.text(line.join(" "));
                    line = word !== '<br>' ? [word] : [];
                    tspan = text.append("tspan").attr("x", x).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
                  }
                }
              });
            }

            function placeRow(selection) {
              selection.attr('transform', function (d) {
                return 'translate(0,' + (yScale(d.name) + (offset[d.name] || 0)) + ')';
              });
            }

            function updateShownStations() {
              tip.hide();
              var table = d3.selectAll('.turnstile-table svg');
              var stationRows = table.selectAll('.row');

              var sections = stationRows.selectAll('.station-section')
                .data(
                  function (d) {
                    return showingStations[d.name] ? [d] : [];
                  },
                  function (d) {
                    return d.name;
                  }
                );
              var newSections = sections
                .enter()
                .append('g')
                .attr('class', 'station-section')
                .attr('clip-path', 'url(#rowTurnstileClip)')
                .attr('transform', 'translate(15,' + (7 + yScale.rangeBand()) + ')');

              newSections
                .append('g')
                .each(function (d) {
                  d3.select(this).call(drawStop, d.name, d, turnstile);
                });
              newSections.append('line')
                .attr('class', 'border')
                .attr('x1', -15)
                .attr('x2', barExtentPx[1] + 20 - 15)
                .attr('y1', -3)
                .attr('y2', -3);

              var currentOffset = 0;
              turnstile.stops.forEach(function (stop) {
                var name = stop.name;
                offset[name] = currentOffset;
                if (showingStations[name]) {
                  currentOffset += heatmapHeight + (numAnnotationLinesInTable[name] || 0) * 12 + 5;
                }
              });

              var exits = sections.exit().attr('class', '.old-station-section').call(function (d) {
                numAnnotationLinesInTable[d.name] = 0;
              });
              newSections.call(hideDetailed);

              setTimeout(function () {
                newSections.transition().call(showDetailed);
                exits.transition().call(hideDetailed).remove();
                stationRows.transition().call(placeRow);
                table.transition().attr('height', bottomOuterHeight + currentOffset);
                adjustRects();
              });
            }

            function adjustRects() {
              rects
                .attr('width', function (d) {
                  return showingStations[d.name] ? bottomOuterWidth : (barExtentPx[0] + barLenScale(d.entrancesByType.all) + numWidthPx);
                })
                .attr('height', function (d) {
                  var name = d.name;
                  var currentOffset = yScale.rangeBand() / 0.7;
                  if (showingStations[name]) {
                    currentOffset += heatmapHeight + (numAnnotationLinesInTable[name] || 0) * 12 + 5;
                  }
                  return currentOffset;
                });
            }

            function showDetailed(selection) {
              selection
                .selectAll('.stop-heatmap')
                .attr('transform', 'translate(0,0)');
            }

            function hideDetailed(selection) {
              selection
                .selectAll('.stop-heatmap')
                .attr('transform', function (d) {
                  return 'translate(0,' + (-heatmapHeight - (numAnnotationLinesInTable[d.name] || 0) * 12) + ')';
                });
            }

            function drawStop(container, name, stopData, aggregates, isAllStationHeatmap) {
              var daysOfWeek = ['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat'];
              var svg = container.append('g').attr('class', 'stop-heatmap');

              var dayLabels = svg.selectAll('.dayLabel')
                .data(daysOfWeek)
                .enter()
                .append('g')
                .attr('class', 'xAxis');

              if (isAllStationHeatmap) {
                dayLabels.append('text')
                  .attr('class', 'dayLabel')
                  .text(function (d) {
                    return d;
                  })
                  .attr('dx', dayWidth / 2)
                  .attr('dy', 0)
                  .style('text-anchor', 'middle');
              }

              var hourLabelsScale = d3.scale.ordinal()
                .domain(['6am', '12pm', '6pm'])
                .rangePoints([0, dayWidth], 2.0);
              var xAxis = d3.svg.axis()
                .scale(hourLabelsScale)
                .orient('bottom')
                .tickSize(-3);
              dayLabels
                .attr('transform', function (d, i) {
                  return 'translate(' + (3 + heatMapMargin.left + (dayWidth + dayMargin.right) * i) + ',0)';
                })
                .call(xAxis);

              var stop = svg.append('g')
                .attr('transform', 'translate(' + heatMapMargin.left + ',' + heatMapMargin.top + ")");

              var colorScale = d3.scale.linear()
                .domain([aggregates.min, aggregates.mean || aggregates.max * 0.9, aggregates.max])
                .range(['white', 'black', 'red']);

              var positionScale = d3.scale.ordinal()
                .rangeBands([0, dayWidth], 0, 0)
                .domain(d3.range(0, 24));

              ['entrances', 'exits'].forEach(function (dir, i) {
                stop.selectAll('.' + dir)
                  .data(stopData.times.filter(function (d) {
                    return !!d;
                  }))
                  .enter().append('rect')
                  .attr('class', function (d) {
                    return 'highlight-dimmable ' + dir + ' ' + classify(d);
                  })
                  .attr('x', function (d) {
                    return (dayWidth + dayMargin.right) * day(d) + positionScale(hour(d));
                  })
                  .attr('y', function (d) {
                    return (hourHeight + dayMargin.bottom) * (week(d) + i * 5);
                  })
                  .attr('width', hourWidth)
                  .attr('height', hourHeight)
                  .attr('fill', function (d) {
                    return colorScale(d[dir]);
                  });
              });

              stop
                .append('text')
                .attr('x', 0)
                .attr('dy', -3)
                .attr('text-anchor', 'end')
                .attr('class', 'weeklabel light-markup small')
                .text('Week');
              stop.selectAll('.grp')
                .data([0, 1])
                .enter()
                .append('g')
                .attr('class', 'grp')
                .attr('transform', function (d) {
                  return 'translate(0,' + (hourHeight + dayMargin.bottom) * (d * 5) + ')';
                })
                .selectAll('.weeklabel')
                .data([0, 1, 2, 3])
                .enter()
                .append('text')
                .attr('class', 'weeklabel light-markup small')
                .attr('x', -3)
                .attr('dy', 6)
                .attr('text-anchor', 'end')
                .attr('y', function (d) {
                  return (hourHeight + dayMargin.bottom) * d;
                })
                .text(function (d) {
                  return (d + 1);
                });

              svg.append('text')
                .attr('class', 'groupLabel light-markup small')
                .attr('transform', 'translate(' + (heatmapWidth - 10) + ',' + (hourHeight * 3.5) + ')rotate(90)')
                .text('entrances')
                .style('text-anchor', 'middle');

              svg.append('text')
                .attr('class', 'groupLabel light-markup small')
                .attr('transform', 'translate(' + (heatmapWidth - 10) + ',' + (hourHeight * 10) + ')rotate(90)')
                .text('exits')
                .style('text-anchor', 'middle');

              svg
                .onOnce('mouseover', 'rect', function (d) {
                  clearTimeout(debounceTimeout);
                  svg.selectAll('rect').classed('hover', function (other) {
                    return d.day === other.day && d.week === other.week && d.hour === other.hour;
                  });
                  tip
                    .direction('w')
                    .offset([-3, -12])
                    .html(function (d) {
                      return getTextForRollover(d, d3.select(this).classed('entrances') ? 'entrances' : 'exits');
                    });

                  tip.show.call(this, d);

                  if (!isAllStationHeatmap) {
                    var updatedSizes = {};
                    var time = hourToAmPm((d.hour) % 24);
                    var timePlusOne = hourToAmPm((d.hour + 1) % 24);
                    var type = d3.select(this).classed('entrances') ? 'entrances' : 'exits';
                    turnstile.stops.forEach(function (stop) {
                      var datum = stop.times[d.i];
                      updatedSizes[mappingData[stop.name]] = datum ? datum[type] : 0;
                    });
                    d3.selectAll('.glyph circle')
                      .attr('r', function (d) {
                        return perHourSizeScale(updatedSizes[d.id]);
                      });
                    var day = moment(d.time).zone(5).format('ddd MMM D');
                    drawMapKey([0, 40, 82], perHourPerMinuteSizeScale, type + ' on ' + day + ' from ' + time + ' to ' + timePlusOne, 'per minute');
                  }
                })
                .onOnce('mouseout', 'rect', function (d) {
                  svg.selectAll('rect').classed('hover', false);
                  tip
                    .direction('n')
                    .offset([-10, 0]);
                  tip.hide.call(this, d);
                  clearTimeout(debounceTimeout);
                  debounceTimeout = setTimeout(resetMapKey, debounceDelayMs);
                });
            }

            function resetMapKey() {
              drawMapKey([500, 10000, 19400], sizeScale, 'entries on average day', 'per day');
              d3.selectAll('.glyph circle')
                .attr('r', function (d) {
                  return sizeScale(averageSecondsBetweenStops[d.id]);
                });
            }

            function hourToAmPm(hour) {
              var time = (hour % 12) === 0 ? 12 : (hour % 12);
              time += ((hour % 24) >= 12 ? 'pm' : 'am');
              return time;
            }

            function classify(d) {
              var theWeek = week(d);
              var theDay = day(d);
              if (isHoliday(theWeek, theDay) || isWeekend(theWeek, theDay)) {
                return 'offpeak';
              } else {
                return 'weekday';
              }
            }

            function hour(d) {
              return d.hour;
            }

            function day(d) {
              return d.day;
            }

            function week(d) {
              return d.week - 1;
            }

            function isHoliday(week, day) {
              return week === 2 && day === 1;
            }

            function isWeekend(week, day) {
              return day === 0 || day === 6;
            }

            function getTextForRollover(d, dataType) {
              console.log(moment(d.time).zone(5).format('ddd MMM D [from] ha'))
              return [
                [
                  moment(d.time).zone(5).format('ddd MMM D [from] ha'),
                  'to',
                  moment(d.time).zone(5).add(1, 'hour').format('ha')
                ].join(' '), [
                  // d3.format(',.0f')(d[dataType] / 60),
                  d3.format(',.0f')(d[dataType]),
                  dataType,
                  'per minute'
                ].join(' ')
              ].join('<br>');
            }
          })
      });
  });


}());