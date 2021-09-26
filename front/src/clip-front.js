/* globals customElements, FileReader */
import { LitElement, html, css } from 'lit-element'
import ClipService from './clip-service'

class ClipFront extends LitElement {
  constructor () {
    super()
    const urlParams = new URLSearchParams(window.location.search)
    const back = urlParams.get('back')
    const index = urlParams.get('index')
    const query = urlParams.get('query')
    const imageUrl = urlParams.get('imageUrl')
    const defaultIndex = 'laion_400m_128G'
    const defaultBackend = 'https://splunk.vra.ro' // put something here
    if (index != null) {
      this.currentIndex = index
    } else {
      this.currentIndex = back === null || back === defaultBackend ? defaultIndex : ''
    }
    if (back != null) {
      this.backendHost = back
    } else {
      this.backendHost = defaultBackend
    }
    if (query != null) {
      this.text = query
    } else {
      this.text = ''
    }
    this.service = new ClipService(this.backendHost)
    this.numImages = 40
    this.numResultIds = 2000
    this.lastMetadataId = null
    this.onGoingMetadataFetch = false
    this.indices = []
    this.images = []
    this.modality = 'image'
    this.blacklist = {}
    this.lastSearch = 'text'
    this.displayCaptions = true
    this.displaySimilarities = false
    this.displayFullCaptions = false
    this.safeMode = true
    this.firstLoad = true
    this.imageUrl = imageUrl === null ? undefined : imageUrl
    this.hideDuplicateUrls = true
    this.initIndices()
  }

  initIndices (forceChange) {
    this.service.getIndices().then(l => {
      this.indices = l
      if (forceChange || this.currentIndex === '') {
        this.currentIndex = this.indices[0]
      }
    })
  }

  static get properties () {
    return {
      service: { type: Object },
      images: { type: Array },
      image: { type: String },
      imageUrl: { type: String },
      text: { type: String },
      numImages: { type: Number },
      modality: { type: String },
      indices: { type: Array },
      currentIndex: { type: String },
      backendHost: { type: String },
      blacklist: { type: Object },
      displaySimilarities: { type: Boolean },
      displayCaptions: { type: Boolean },
      displayFullCaptions: { type: Boolean },
      safeMode: { type: Boolean },
      hideDuplicateUrls: { type: Boolean }
    }
  }

  firstUpdated () {
    const searchElem = this.shadowRoot.getElementById('searchBar')
    searchElem.addEventListener('keyup', e => { if (e.keyCode === 13) { this.textSearch() } })
    const productsElement = this.shadowRoot.getElementById('products')
    window.onscroll = () => {
      if ((window.innerHeight + window.pageYOffset) >= productsElement.offsetHeight) {
        this.fetchMoreMetadata()
      }
    }
  }

  async initialScroll () {
    const productsElement = this.shadowRoot.getElementById('products')
    let i = 0
    while ((window.innerHeight + window.pageYOffset) >= productsElement.offsetHeight) {
      await this.fetchMoreMetadata()
      i += 1
      if (i > 5) {
        break
      }
    }
  }

  updated (_changedProperties) {
    if (_changedProperties.has('backendHost')) {
      this.service.backend = this.backendHost
      this.initIndices(!this.firstLoad)
      this.firstLoad = false
      this.setUrlParams()
    }
    if (_changedProperties.has('currentIndex')) {
      this.setUrlParams()
    }
    if (_changedProperties.has('image')) {
      if (this.image !== undefined) {
        this.imageSearch()
        return
      }
    }
    if (_changedProperties.has('imageUrl')) {
      if (this.imageUrl !== undefined) {
        this.imageUrlSearch()
        return
      }
    }
    if (_changedProperties.has('modality') || _changedProperties.has('currentIndex')) {
      if (this.image !== undefined || this.text !== '' || this.imageUrl !== undefined) {
        this.redoSearch()
      }
    }
  }

  async redoSearch () {
    if (this.lastSearch === 'text') {
      this.textSearch()
    } else if (this.lastSearch === 'image') {
      this.imageSearch()
    } else if (this.lastSearch === 'imageUrl') {
      this.imageUrlSearch()
    }
  }

  setUrlParams () {
    const urlParams = new URLSearchParams(window.location.search)
    if (this.text !== '') {
      urlParams.set('query', this.text)
    } else {
      urlParams.delete('query')
    }
    if (this.imageUrl !== undefined) {
      urlParams.set('imageUrl', this.imageUrl)
    } else {
      urlParams.delete('imageUrl')
    }
    urlParams.set('back', this.backendHost)
    urlParams.set('index', this.currentIndex)
    window.history.pushState({}, '', '?' + urlParams.toString())
  }

  async fetchMoreMetadata (amount = 40) {
    if (this.onGoingMetadataFetch) {
      return
    }
    this.onGoingMetadataFetch = true
    console.log('fetching more metadata starting from position', this.lastMetadataId)
    if (this.lastMetadataId === null) {
      this.onGoingMetadataFetch = false
      return
    }
    amount = Math.min(amount, this.numResultIds - this.lastMetadataId - 1)
    if (amount <= 0) {
      this.onGoingMetadataFetch = false
      return
    }
    const ids = this.images.slice(this.lastMetadataId + 1, this.lastMetadataId + amount + 1).map(i => i.id)
    try {
      const metasWithIds = Object.fromEntries((await this.service.getMetadata(ids, this.currentIndex)).map(({ id, metadata }) => [id, metadata]))
      this.images = this.images.map(image => {
        if (metasWithIds[image.id] !== undefined) {
          image = { ...metasWithIds[image.id], ...image }
        }
        return image
      })
      this.lastMetadataId += amount
    } catch (e) {
      console.log(e)
    }
    this.onGoingMetadataFetch = false
  }

  async textSearch () {
    if (this.text === '') {
      return
    }
    this.image = undefined
    this.imageUrl = undefined
    const results = await this.service.callClipService(this.text, null, null, this.modality, this.numImages, this.currentIndex, this.numResultIds)
    console.log(results)
    this.images = results
    this.lastMetadataId = Math.min(this.numImages, results.length) - 1
    this.lastSearch = 'text'
    this.setUrlParams()
    setTimeout(() => this.initialScroll(), 0)
  }

  async imageSearch () {
    this.text = ''
    this.imageUrl = undefined
    const results = await this.service.callClipService(null, this.image, null, this.modality, this.numImages, this.currentIndex, this.numResultIds)
    console.log(results)
    this.images = results
    this.lastMetadataId = Math.min(this.numImages, results.length) - 1
    this.lastSearch = 'image'
    this.setUrlParams()
    setTimeout(() => this.initialScroll(), 0)
  }

  async imageUrlSearch () {
    this.text = ''
    this.image = undefined
    const results = await this.service.callClipService(null, null, this.imageUrl, this.modality, this.numImages, this.currentIndex, this.numResultIds)
    console.log(results)
    this.images = results
    this.lastMetadataId = Math.min(this.numImages, results.length) - 1
    this.lastSearch = 'imageUrl'
    this.setUrlParams()
    setTimeout(() => this.initialScroll(), 0)
  }
  static get styles () {
    return css`
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus,
    input:-webkit-autofill:active {
        -webkit-transition: "color 9999s ease-out, background-color 9999s ease-out";
        -webkit-transition-delay: 9999s;
    }

    figcaption {
      display: table-caption;
      caption-side: bottom;
      background: #fff;
      padding: 0 0px 0px;
    }

    #searchBar, #searchBar:hover, #searchBar:focus, #searchBar:valid {
      border-radius: 25px;
      border-color: #ddd;
      background-color:white;
      border-width:1px;
      width:85%;
      padding:15px;
      outline: none;
      border-style: solid;
      font-size:16px;
      font-family:arial, sans-serif;
    }
    #searchBar:hover, #searchBar:focus {
      box-shadow: 0px 0px 7px  #ccc;
    }
    #all {
      margin-left:2%;
      margin-right:2%;
      margin-top:2%;
    }
    #inputSearchBar:hover > #searchBar {
      box-shadow: 0px 0px 7px  #ccc !important;
    }
    #imageSearch {
      width: 22px;
      margin-left:0.5%;
      vertical-align:middle;
      cursor:pointer;
    }
    #textSearch {
      width: 22px;
      margin-left:1.5%;
      vertical-align:middle;
      cursor:pointer;
    }
    .subImageSearch {
      width: 22px;
      height: 22px:
      cursor:pointer;
      float:right;
      z-index:90;
      display:None;
    }
    .subTextSearch {
      width: 22px;
      height: 22px:
      cursor:pointer;
      margin-left:5%;
      margin-right:5%;
      float:right;
      z-index:90;
      display:None;
    }
    figure:hover > .subImageSearch {
      display:inline;
      cursor:pointer;
    }
    figure:hover > .subTextSearch {
      display:inline;
      cursor:pointer;
    }
    #products {
      margin-top:50px;
      width:85%;
      float:right;
      display: inline-grid;
    }
    @media (min-width: 500px) {
      #products {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    
    @media (min-width: 700px) {
      #products{
        grid-template-columns: repeat(4, 1fr);
      }
    }
    
    @media (min-width: 1000px) {
      #products {
        grid-template-columns: repeat(5, 1fr);
      }
    }
    
    @media (min-width: 1300px) {
      #products {
        grid-template-columns: repeat(7, 1fr);
      }
    }
    
    @media (min-width: 1600px) {
      #products{
        grid-template-columns: repeat(8, 1fr);
      }
    }
    #filter {
      position:absolute;
      top:20px;
      width:12%;
      float:left;
    }
    #searchLine {
      margin-left:15%;
    }

    figcaption {
      font-size:16px;
    }

    figure,img.pic,figcaption {
      width:150px;
    }

    @media (max-width: 500px) {

      #searchBar, #searchBar:hover, #searchBar:focus, #searchBar:valid {
        width:60%;
      }
      #filter {
        font-size:14px;
        width:100px;
      }

      #products {
        grid-template-columns: repeat(3, 1fr);
      }
      figure,img.pic,figcaption {
      width:70px;
      }
      #searchLine {
        margin-left:100px;
      }

      figcaption {
        font-size:12px;
      }

    #products {
      width:60%;
    }
    }

    `
  }

  isSafe (image) {
    if ((image['NSFW'] === 'UNSURE' || image['NSFW'] === 'NSFW')) {
      return false
    }
    const badWords = ['boob', 'sexy', 'ass', 'mature', 'nude', 'naked', 'porn', 'xvideo',
      'ghetto', 'tube', 'hump', 'fuck', 'dick', 'whore', 'masturbate', 'video', 'puss', 'erotic']
    if (badWords.some(word => (image['url'] !== undefined && image['url'].toLowerCase().includes(word)) ||
    (image['caption'] !== undefined && image['caption'].toLowerCase().includes(word)))) {
      return false
    }
    return true
  }

  updateImage (file) {
    var reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      this.image = reader.result.split(',')[1]
    }
    reader.onerror = (error) => {
      console.log('Error: ', error)
    }
  }

  renderImage (image) {
    let src
    if (image['image'] !== undefined) {
      src = `data:image/png;base64, ${image['image']}`
    }
    if (image['url'] !== undefined) {
      src = image['url']
    }
    /*
    // useful for testing broken images
    const hashCode = s => s.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)

    const disp =  hashCode(src) % 2 == 0
    src = (disp ? "" : "sss") +src
    */
    return html`
    <figure style="margin:5px;display:table" 
    style=${'margin:1px; ' + (this.blacklist[src] !== undefined ? 'display:none' : 'display:inline')}>
     ${this.displaySimilarities ? html`<p>${(image['similarity']).toFixed(4)}</p>` : ``}
      ${image['caption'] !== undefined
    ? html`<img src="assets/search.png" class="subTextSearch" @click=${() => { this.text = image['caption']; this.textSearch() }} />` : ``}
     
     <img src="assets/image-search.png" class="subImageSearch" @click=${() => {
    if (image['image'] !== undefined) {
      this.image = image['image']
    } else if (image['url'] !== undefined) {
      this.imageUrl = image['url']
    }
  }} />
      <img class="pic" src="${src}" alt="${image['caption'] !== undefined ? image['caption'] : ''}"" 
      title="${image['caption'] !== undefined ? image['caption'] : ''}"
      @error=${() => { this.blacklist = { ...this.blacklist, ...{ [src]: true } } }} />
      
      ${this.displayCaptions ? html`<figcaption>
      ${image['caption'] !== undefined && image['caption'].length > 50 &&
      !this.displayFullCaptions ? image['caption'].substr(0, 50) + '...' : image['caption']}</figcaption>` : ''}
    
    
    </figure>
    `
  }

  filterDuplicateUrls (images) {
    const urls = {}
    return images.filter(image => {
      if (image['url'] !== undefined) {
        if (urls[image['url']] === undefined) {
          urls[image['url']] = true
          return true
        }
      }
      return false
    })
  }

  render () {
    const preFiltered = this.images
      .filter(image => image['caption'] !== undefined || image['url'] !== undefined || image['image'] !== undefined)
      .filter(image => !this.safeMode || this.isSafe(image))
    const filteredImages = this.hideDuplicateUrls ? this.filterDuplicateUrls(preFiltered) : preFiltered

    return html`
    <div id="all">
    <div id="searchLine">
      <span id="inputSearchBar">
        <input id="searchBar" type="text" .value=${this.text} @input=${e => { this.text = e.target.value }}/>
        <img src="assets/search.png" id="textSearch" @click=${() => { this.textSearch() }} />
        <img src="assets/image-search.png" id="imageSearch" @click=${() => { this.shadowRoot.getElementById('filechooser').click() }} />
        <input type="file" id="filechooser" style="position:absolute;top:-100px" @change=${() =>
    this.updateImage(this.shadowRoot.getElementById('filechooser').files[0])}>
      </span>
     
    </div>
    <div id="filter">
    Backend url: <br /><input type="text" style="width:80px" value=${this.backendHost} @input=${e => { this.backendHost = e.target.value }}/><br />
    Index: <br /><select style="margin-bottom:50px;" @input=${e => { this.currentIndex = e.target.value }}>${this.indices.map(index =>
  html`<option value=${index} ?selected=${index === this.currentIndex}>${index}</option>`)}</select><br />
      ${this.image !== undefined ? html`<img width="100px" src="data:image/png;base64, ${this.image}"" /><br />` : ``}
      ${this.imageUrl !== undefined ? html`<img width="100px" src="${this.imageUrl}"" /><br />` : ``}
      <a href="https://github.com/rom1504/clip-retrieval">Clip retrieval</a> works by converting the text query to a CLIP embedding
      , then using that embedding to query a knn index of clip image embedddings<br /><br />
      <label>Display captions<input type="checkbox" ?checked="${this.displayCaptions}" @click=${() => { this.displayCaptions = !this.displayCaptions }} /></label><br />
      <label>Display full captions<input type="checkbox" ?checked="${this.displayFullCaptions}" @click=${() => { this.displayFullCaptions = !this.displayFullCaptions }} /></label><br />
      <label>Display similarities<input type="checkbox" ?checked="${this.displaySimilarities}" @click=${() => { this.displaySimilarities = !this.displaySimilarities }} /></label><br />
      <label>Safe mode<input type="checkbox" ?checked="${this.safeMode}" @click=${() => { this.safeMode = !this.safeMode }} /></label><br />
      <label>Hide duplicate urls<input type="checkbox" ?checked="${this.hideDuplicateUrls}" @click=${() => { this.hideDuplicateUrls = !this.hideDuplicateUrls }} /></label><br />
      <label>Search over <select @input=${e => { this.modality = e.target.value }}>${['image', 'text'].map(modality =>
  html`<option value=${modality} ?selected=${modality === this.modality}>${modality}</option>`)}</select>
        <p>This UI may contain results with nudity and is best used by adults. The images are under their own copyright.</p>
        <p>Are you seeing near duplicates ? KNN search are good at spotting those, especially so in large datasets.</p>
     </div>

    <div id="products">
    ${filteredImages.map(image => this.renderImage(image))}
    ${this.safeMode && this.images.length !== 0 && filteredImages.length === 0 ? 'Displaying only nice pictures in safe mode!' : ''}
    </div>
    </div>
    `
  }
}

customElements.define('clip-front', ClipFront)
