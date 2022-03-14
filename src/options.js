/*
 * Copyright Adam Pritchard 2015
 * MIT License : http://adampritchard.mit-license.org/
 */

"use strict";
/* jshint browser:true, jquery:true, sub:true */
/* eslint-env jquery */
/* global OptionsStore:false, chrome:false, marked:false, markdownHere:false, Utils:false,
   MdhHtmlToText:false */

/*
 * Main script file for the options page.
 */

var cssEdit, cssSyntaxEdit, cssSyntaxSelect, rawMarkdownIframe, savedMsg,
  mathEnable, mathEdit, hotkeyShift, hotkeyCtrl, hotkeyAlt, hotkeyKey,
  forgotToRenderCheckEnabled, gfmLineBreaksEnabled;
var loaded = false;

function onLoad() {
  var xhr;

  localize();

  // Set up our control references.
  cssEdit = document.getElementById('css-edit');
  cssSyntaxEdit = document.getElementById('css-syntax-edit');
  cssSyntaxSelect = document.getElementById('css-syntax-select');
  rawMarkdownIframe = document.getElementById('rendered-markdown');
  savedMsg = document.getElementById('saved-msg');
  mathEnable = document.getElementById('math-enable');
  mathEdit = document.getElementById('math-edit');
  hotkeyShift = document.getElementById('hotkey-shift');
  hotkeyCtrl = document.getElementById('hotkey-ctrl');
  hotkeyAlt = document.getElementById('hotkey-alt');
  hotkeyKey = document.getElementById('hotkey-key');
  forgotToRenderCheckEnabled = document.getElementById('forgot-to-render-check-enabled');
  gfmLineBreaksEnabled = document.getElementById('gfm-line-breaks-enabled');

  //
  // Syntax highlighting styles and selection
  //

  // Get the available highlight.js styles.
  xhr = new XMLHttpRequest();
  xhr.overrideMimeType('application/json');
  xhr.open('GET', 'highlightjs/styles/styles.json');
  xhr.onreadystatechange = function() {
    if (this.readyState === this.DONE) {
      // Assume 200 OK -- it's just a local call
      var syntaxStyles = JSON.parse(this.responseText);

      for (var name in syntaxStyles) {
        cssSyntaxSelect.options.add(new Option(name, syntaxStyles[name]));
      }

      cssSyntaxSelect.options.add(new Option(Utils.getMessage('currently_in_use'), ''));
      cssSyntaxSelect.selectedIndex = cssSyntaxSelect.options.length - 1;

      cssSyntaxSelect.addEventListener('change', cssSyntaxSelectChange);
    }
  };
  xhr.send();

  //
  // Restore previously set options (asynchronously)
  //

  var optionsGetSuccessful = false;
  OptionsStore.get(function(prefs) {
    cssEdit.value = prefs['main-css'];
    cssSyntaxEdit.value = prefs['syntax-css'];

    mathEnable.checked = prefs['math-enabled'];
    mathEdit.value = prefs['math-value'];

    hotkeyShift.checked = prefs.hotkey.shiftKey;
    hotkeyCtrl.checked = prefs.hotkey.ctrlKey;
    hotkeyAlt.checked = prefs.hotkey.altKey;
    hotkeyKey.value = prefs.hotkey.key;

    hotkeyChangeHandler();

    forgotToRenderCheckEnabled.checked = prefs['forgot-to-render-check-enabled'];

    gfmLineBreaksEnabled.checked = prefs['gfm-line-breaks-enabled'];

    // Start watching for changes to the styles.
    setInterval(checkChange, 100);

    optionsGetSuccessful = true;
  });

  // Load the changelist section
  loadChangelist();

  const test_link = document.getElementById("tests-link");
  test_link.onclick = function(event) {
    event.preventDefault();
    Utils.makeRequestToPrivilegedScript(
      document,
      { action: 'open-tab', url: test_link.querySelector("a").href }
    )
  }
  loaded = true;
}
document.addEventListener('DOMContentLoaded', onLoad, false);


// The Preview <iframe> will let us know when it's loaded, so that we can
// trigger the rendering of it.
function previewIframeLoaded() {
  // Even though the IFrame is loaded, the page DOM might not be, so we don't
  // yet have a valid state. In that case, set a timer.
  if (loaded) {
    renderMarkdown();
  }
  else {
    setTimeout(previewIframeLoaded, 100);
  }
}
document.addEventListener('options-iframe-loaded', previewIframeLoaded);


function localize() {
  const elements = document.querySelectorAll("[data-i18n]");
  elements.forEach(el => {
    const messageId = `options_page__${el.getAttribute("data-i18n")}`;
    const message = Utils.getMessage(messageId);
    if (el.tagName.toUpperCase() === "TITLE") {
      el.innerText = message;
    } else {
      Utils.saferSetInnerHTML(el, message);
    }
  });
}


// If the CSS changes and the Markdown compose box is rendered, update the
// rendering by toggling twice. If the compose box is not rendered, do nothing.
// Groups changes together rather than on every keystroke.
var lastOptions = '';
var lastChangeTime = null;
var firstSave = true;
function checkChange() {
  var newOptions =
        cssEdit.value + cssSyntaxEdit.value +
        mathEnable.checked + mathEdit.value +
        hotkeyShift.checked + hotkeyCtrl.checked + hotkeyAlt.checked + hotkeyKey.value +
        forgotToRenderCheckEnabled.checked +
        gfmLineBreaksEnabled.checked;

  if (newOptions !== lastOptions) {
    // CSS has changed.
    lastOptions = newOptions;
    lastChangeTime = new Date();
  }
  else {
    // No change since the last check.
    // There's a delicate balance to choosing this apply/save-change timeout value.
    // We want the user to see the effects of their change quite quickly, but
    // we don't want to spam our saves (because there are quota limits). But we
    // have to save before we can re-render (the rendering using the saved values).
    if (lastChangeTime && (new Date() - lastChangeTime) > 400) {
      // Sufficient time has passed since the last change -- time to save.
      lastChangeTime = null;

      OptionsStore.set(
        {
          'main-css': cssEdit.value,
          'syntax-css': cssSyntaxEdit.value,
          'math-enabled': mathEnable.checked,
          'math-value': mathEdit.value,
          'hotkey': {
                      shiftKey: hotkeyShift.checked,
                      ctrlKey: hotkeyCtrl.checked,
                      altKey: hotkeyAlt.checked,
                      key: hotkeyKey.value
                    },
          'forgot-to-render-check-enabled': forgotToRenderCheckEnabled.checked,
          'gfm-line-breaks-enabled': gfmLineBreaksEnabled.checked
        },
        function() {
          updateMarkdownRender();

          Utils.makeRequestToPrivilegedScript(document,{action: 'update-hotkey'});

          // Show the "saved changes" message, unless this is the first save
          // (i.e., the one when the user first opens the options window).
          if (!firstSave) {
            savedMsg.classList.add('showing');

            // Hide it a bit later.
            // Alternatively, could use the 'transitionend' event. But this way
            // we control how long it shows.
            setTimeout(function() {
              savedMsg.classList.remove('showing');
            }, 2000);
          }
          firstSave = false;
        });
    }
  }
}

// This function stolen entirely from composescript.js and ff-overlay.js
function requestMarkdownConversion(elem, range, callback) {
  var mdhHtmlToText = new MdhHtmlToText.MdhHtmlToText(elem, range);

  Utils.makeRequestToPrivilegedScript(
    document,
    { action: 'render', mdText: mdhHtmlToText.get() },
    function(response) {
      var renderedMarkdown = mdhHtmlToText.postprocess(response.html);
      callback(renderedMarkdown, response.css);
    });
}

// Render the sample Markdown.
function renderMarkdown(postRenderCallback) {
  if (rawMarkdownIframe.contentDocument.querySelector('.markdown-here-wrapper')) {
    // Already rendered.
    if (postRenderCallback) postRenderCallback();
    return;
  }

  // Begin rendering.
  markdownHere(rawMarkdownIframe.contentDocument, requestMarkdownConversionInterceptor);

  // To figure out when the (asynchronous) rendering is complete -- so we
  // can call the `postRenderCallback` -- we'll intercept the callback used
  // by the rendering service.

  function requestMarkdownConversionInterceptor(elem, range, callback) {

    function callbackInterceptor() {
      callback.apply(null, arguments);

      // Rendering done. Call callback.
      if (postRenderCallback) postRenderCallback();
    }

    // Call the real rendering service.
    requestMarkdownConversion(elem, range, callbackInterceptor);
  }
}

// Re-render already-rendered sample Markdown.
function updateMarkdownRender() {
  if (!rawMarkdownIframe.contentDocument.querySelector('.markdown-here-wrapper')) {
    // Not currently rendered, so nothing to update.
    return;
  }

  // To mitigate flickering, hide the iframe during rendering.
  rawMarkdownIframe.style.visibility = 'hidden';

  // Unrender
  markdownHere(rawMarkdownIframe.contentDocument, requestMarkdownConversion);

  // Re-render
  renderMarkdown(function() {
    rawMarkdownIframe.style.visibility = 'visible';
  });
}

// Toggle the render state of the sample Markdown.
function markdownToggle() {
  markdownHere(rawMarkdownIframe.contentDocument, requestMarkdownConversion);
}
document.querySelector('#markdown-toggle-button').addEventListener('click', markdownToggle, false);

// Reset the main CSS to default.
function resetCssEdit() {
  // Get the default value.
  var xhr = new XMLHttpRequest();
  xhr.overrideMimeType(OptionsStore.defaults['main-css']['__mimeType__']);
  xhr.open('GET', OptionsStore.defaults['main-css']['__defaultFromFile__']);
  xhr.onreadystatechange = function() {
    if (this.readyState === this.DONE) {
      // Assume 200 OK -- it's just a local call
      cssEdit.value = this.responseText;
    }
  };
  xhr.send();
}
document.getElementById('reset-button').addEventListener('click', resetCssEdit, false);

// The syntax hightlighting CSS combo-box selection changed.
function cssSyntaxSelectChange() {
  var selected = cssSyntaxSelect.options[cssSyntaxSelect.selectedIndex].value;
  if (!selected) {
    // This probably indicates that the user selected the "currently in use"
    // option, which is by definition what is in the edit box.
    return;
  }

  // Remove the "currently in use" option, since it doesn't make sense anymore.
  if (!cssSyntaxSelect.options[cssSyntaxSelect.options.length-1].value) {
    cssSyntaxSelect.options.length -= 1;
  }

  // Get the CSS for the selected theme.
  var xhr = new XMLHttpRequest();
  xhr.overrideMimeType('text/css');
  xhr.open('GET', 'highlightjs/styles/'+selected);
  xhr.onreadystatechange = function() {
    if (this.readyState === this.DONE) {
      // Assume 200 OK -- it's just a local call
      cssSyntaxEdit.value = this.responseText;
    }
  };
  xhr.send();
}

function loadChangelist() {
  var xhr = new XMLHttpRequest();
  xhr.overrideMimeType('text/plain');

  // Get the changelist from a local file.
  xhr.open('GET', 'CHANGES.md');
  xhr.onreadystatechange = function() {
    if (this.readyState === this.DONE) {
      // Assume 200 OK -- it's just a local call
      var changes = this.responseText;

      var markedOptions = {
            gfm: true,
            pedantic: false,
            sanitize: false };

      changes = marked(changes, markedOptions);

      Utils.saferSetInnerHTML(document.getElementById("changelist"), changes);

/*      var prevVer = location.search ? location.search.match(/prevVer=([0-9\.]+)/) : null;
      if (prevVer) {
        prevVer = prevVer[1]; // capture group

        var prevVerStart = $('#changelist h2').filter(function() { return $(this).text().match(new RegExp('v'+prevVer+'$')); });
        $('#changelist').find('h1:first')
          .after('<h2>' + Utils.getMessage('new_changelist_items') + '</h2>')
          .nextUntil(prevVerStart)
          .wrapAll('<div class="changelist-new"></div>');

        // Move the changelist section up in the page
        $('#changelist-container').insertAfter('#pagehead');
      }*/
    }
  };
  xhr.send();
}

// Choose one of the donate pleas to use, and update the donate info so we can
// A/B test them.
function showDonatePlea() {
  return true;
}

// Reset the math img tag template to default.
function resetMathEdit() {
  mathEdit.value = OptionsStore.defaults['math-value'];
}
document.getElementById('math-reset-button').addEventListener('click', resetMathEdit, false);

// When the user changes the hotkey key, check if it's an alphanumeric value.
// We only warning and not strictly enforcing because what's considered "alphanumeric"
// in other languages and/or on other keyboards might be different.
function hotkeyChangeHandler() {
  // Check for a valid key value.
  var regex = new RegExp('^[a-zA-Z0-9]$');
  var value = hotkeyKey.value;
  const hotkeywarning = document.getElementById("hotkey-key-warning");
  if (value.length && !regex.test(value)) {
    hotkeywarning.classList.remove("hidden");
  }
  else {
    hotkeywarning.classList.add("hidden");
  }

  // Set any representations of the hotkey to the new value.

  var hotkeyPieces = [];
  if (hotkeyShift.checked) hotkeyPieces.push(Utils.getMessage('options_page__hotkey_shift_key'));
  if (hotkeyCtrl.checked) hotkeyPieces.push(Utils.getMessage('options_page__hotkey_ctrl_key'));
  if (hotkeyAlt.checked) hotkeyPieces.push(Utils.getMessage('options_page__hotkey_alt_key'));
  if (hotkeyKey.value) hotkeyPieces.push(hotkeyKey.value.toString().toUpperCase());

  /*$('.hotkey-display').each(function() {
    var $hotkeyElem = $(this);
    if (hotkeyKey.value) {
      if ($hotkeyElem.parent().hasClass('hotkey-display-wrapper')) {
        $hotkeyElem.parent().css({display: ''});
      }
      $hotkeyElem.css({display: ''});
      $hotkeyElem.empty();

      $.each(hotkeyPieces, function(idx, piece) {
        if (idx > 0) {
          $hotkeyElem.append(document.createTextNode(Utils.getMessage('options_page__hotkey_plus')));
        }
        $('<kbd>').text(piece).appendTo($hotkeyElem);
      });
    }
    else {
      if ($hotkeyElem.parent().hasClass('hotkey-display-wrapper')) {
        $hotkeyElem.parent().css({display: 'none'});
      }
      $hotkeyElem.css({display: 'none'});
    }
  });*/
}
document.getElementById('hotkey-key').addEventListener('keyup', hotkeyChangeHandler, false);
document.getElementById('hotkey-shift').addEventListener('click', hotkeyChangeHandler, false);
document.getElementById('hotkey-ctrl').addEventListener('click', hotkeyChangeHandler, false);
document.getElementById('hotkey-alt').addEventListener('click', hotkeyChangeHandler, false);
