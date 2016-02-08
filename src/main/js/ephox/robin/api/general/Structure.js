define(
  'ephox.robin.api.general.Structure',

  [
    'ephox.compass.Arr'
  ],

  function (Arr) {
    var blockList = [
      'body',
      'p',
      'div',
      'article',
      'aside',
      'figcaption',
      'figure',
      'footer',
      'header',
      'nav',
      'section',
      'ol',
      'ul',
      // --- NOTE, TagBoundaries has li here. That means universe.isBoundary => true for li tags.
      'table',
      'thead',
      'tfoot',
      'tbody',
      'caption',
      'tr',
      'td',
      'th',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'pre',
      'address'
    ];

    var isList = function (universe, item) {
      var tagName = universe.property().name(item);
      return Arr.contains([ 'ol', 'ul' ], tagName);
    };

    var isBlock = function (universe, item) {
      var tagName = universe.property().name(item);
      return Arr.contains(blockList, tagName);
    };

    var isFormatting = function (universe, item) {
      var tagName = universe.property().name(item);
      return Arr.contains([ 'address', 'pre', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6' ], tagName);
    };

    var isContainer = function (universe, item) {
      return Arr.contains([ 'div', 'li', 'td', 'th', 'blockquote', 'body', 'caption' ], universe.property().name(item));
    };

    var isEmptyTag = function (universe, item) {
      return Arr.contains([ 'br', 'img', 'hr', 'input' ], universe.property().name(item));
    };

    var isFrame = function (universe, item) {
      return universe.property().name(item) === 'iframe';
    };

    return {
      isBlock: isBlock,
      isList: isList,
      isFormatting: isFormatting,
      isContainer: isContainer,
      isEmptyTag: isEmptyTag,
      isFrame: isFrame
    };
  }
);
