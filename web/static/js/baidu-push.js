/**
 * 百度自动推送 - 用户访问页面时自动通知百度收录
 * 官方文档: https://ziyuan.baidu.com/linksubmit/index
 */
(function () {
  try {
    var bp = document.createElement('script');
    var curProtocol = window.location.protocol.split(':')[0];
    if (curProtocol === 'https') {
      bp.src = 'https://zz.bdstatic.com/linksubmit/push.js';
    } else {
      bp.src = 'http://push.zhanzhang.baidu.com/push.js';
    }
    bp.async = true;
    var s = document.getElementsByTagName('script')[0];
    s.parentNode.insertBefore(bp, s);
  } catch (e) {
    // 静默失败,不影响正常业务
  }
})();
