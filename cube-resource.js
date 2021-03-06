import '../../@polymer/polymer/polymer.js';
import { Debouncer } from '../../@polymer/polymer/lib/utils/debounce.js';
import { microTask } from '../../@polymer/polymer/lib/utils/async.js';
import { Element } from '../../@polymer/polymer/polymer-element.js';
const $_documentContainer = document.createElement('div');
$_documentContainer.setAttribute('style', 'display: none;');

$_documentContainer.innerHTML = `<dom-module id="cube-resource" attributes="auto auth url response data method headers ttl xhr status no-request-by pending">
  
</dom-module>`;

document.head.appendChild($_documentContainer);
/**
 * @customElement
 * @polymer
 */
class CubeResource extends Element
{
  static get is() { return 'cube-resource'; }

  static get properties()
  {
    return {
      auto: {type: Boolean, value: false},
      auth: {type: Boolean, value: false},
      noRequestBy: {type: Boolean, value: false},
      /**
       * ttl: time to live (in seconds)
       */
      ttl: {type: Number, value: 2},
      url: {type: String},
      headers: {type: Object, value: function () { return {}; }},
      method: {type: String, value: 'GET'},
      data: {type: Object, value: function () { return {}; }},
      response: {type: String, readOnly: true, notify: true},
      xhr: {type: String, readOnly: true, notify: true},
      status: {type: Number, value: -1, notify: true},
      pending: {type: Boolean, value: true, notify: true},
      /**
       * resource cache, shared object between instances (value not wrapped with function)
       */
      _resourceCache: {type: Object, value: {}},
      _headers: {type: Object, computed: '_refreshHeaders(headers)'},

      _xhr: {type: Object, value: null},
      _debounceTrigger: {type: Object, value: null}
    };
  }

  static get observers()
  {
    return ['_updateResource(auto,ttl,url,method,data,data.*,headers)'];
  }

  connectedCallback()
  {
    super.connectedCallback();
    document.addEventListener(CubeResource._NOTIFY_EVENT_NAME, this._resourceUpdated.bind(this));

  }

  _refreshHeaders(headers)
  {
    if(!this.noRequestBy)
    {
      headers['X-Requested-By'] = 'cube-resource';
    }
    return headers;
  }

  _resourceUpdated(e)
  {
    let key = this._cacheKey();
    if(key && e.detail && e.detail.key === key)
    {
      this._setExportsFromStruct(e.detail);
    }
  }

  update(ignoreCache)
  {
    this._updateResource(true, ignoreCache ? 0 : this.ttl);
  }

  _setExportsFromStruct(dataStruct)
  {
    this._setPendingProperty('status', dataStruct.status !== undefined ? dataStruct.status : -1, true);
    this._setPendingProperty('pending', !!dataStruct.pending, true);

    if(this.xhr !== dataStruct.xhr)
    {
      this._setPendingProperty('xhr', dataStruct.xhr, true);
    }
    if(this.response !== dataStruct.response)
    {
      this._setPendingProperty('response', dataStruct.response, true);
    }

    this._invalidateProperties();
  }

  _updateResource(request, ttl)
  {
    if(request && this.url)
    {
      let key = this._cacheKey();
      if(ttl && this._resourceCache[key] && this._resourceCache[key].expires >
        Date.now())
      {
        this._setExportsFromStruct(this._resourceCache[key]);
      }
      else
      {
        this._debounceTrigger = Debouncer.debounce(
          this._debounceTrigger,
          microTask,
          this._triggerRequest.bind(this)
        );
      }
    }
    else
    {
      this._setExportsFromStruct(this._makeCache());
    }
  }

  _dispatchCached()
  {
    //noinspection JSCheckFunctionSignatures
    document.dispatchEvent(
      new CustomEvent(CubeResource._NOTIFY_EVENT_NAME, {detail: this._resourceCache[this._cacheKey()]})
    );
  }

  _triggerRequest()
  {
    let self = this,
        key  = self._cacheKey();
    if(!this._resourceCache[key])
    {
      this._resourceCache[key] = this._makeCache(key, undefined, undefined, true);
    }
    else if(this._resourceCache[key].pending)
    {
      // request already pending
      return;
    }
    else
    {
      this._resourceCache[key].status = -1;
      this._resourceCache[key].pending = true;
    }

    if(this._xhr)
    {
      this._xhr.abort();
    }
    this._xhr = new XMLHttpRequest();
    this._xhr.addEventListener(
      'readystatechange',
      function ()
      {
        if(this.readyState === XMLHttpRequest.DONE)
        {
          let response = undefined;
          switch(this.getResponseHeader('content-type'))
          {
            case 'application/json':
              response = JSON.parse(this.responseText);
              break;
            default:
              response = this.responseText;
              break;
          }
          self._xhr = null;
          self._resourceCache[key] = self._makeCache(key, this, response, false);
          self._resourceCache[key].status = this.status;
          self._dispatchCached();
        }
      }
    );

    this._xhr.open(this.method, this.url);

    if(this._headers)
    {
      let keys = Object.keys(this._headers);
      for(let idx in keys)
      {
        if(keys.hasOwnProperty(idx))
        {
          this._xhr.setRequestHeader(keys[idx], this._headers[keys[idx]]);
        }
      }
    }
    this._xhr.withCredentials = Boolean(this.auth);

    let data = new FormData();
    if(this.data)
    {
      let keys = Object.keys(this.data);
      for(let k in keys)
      {
        if(this.data.hasOwnProperty(keys[k]))
        {
          data.append(keys[k], this.data[keys[k]]);
        }
      }
    }
    this._dispatchCached();
    this._xhr.send(data);
  }

  _cacheKey()
  {
    if(this.url)
    {
      return JSON.stringify([this.method, this.url, this.data, this._headers]);
    }
    return undefined;
  }

  _makeCache(key, xhr, response, pending)
  {
    return {
      key: key ? key : undefined,
      xhr: xhr ? xhr : undefined,
      response: response ? response : undefined,
      pending: pending ? pending : undefined,
      expires: (this.ttl * 1000) + Date.now()
    };
  }

  static get _NOTIFY_EVENT_NAME() {return 'cubex-resource-updated';};
}

window.customElements.define(CubeResource.is, CubeResource);
