::  boox: ebook reader and library manager for urbit
::
::  manages book metadata, reading positions, and serves
::  a JSON API via eyre. books stored on S3 (via system
::  %storage agent), metadata here.
::
/-  boox
/+  dbug, verb, server, default-agent
|%
+$  card  card:agent:gall
++  format-to-cord
  |=  fmt=format:boox
  ^-  @t
  ?-  fmt
    %pdf   'pdf'
    %epub  'epub'
    %mobi  'mobi'
    %txt   'txt'
    %md    'md'
    %html  'html'
  ==
--
::
%-  agent:dbug
=|  state-2:boox
=*  state  -
=/  remote-cache  *(map @p json)
%+  verb  |
^-  agent:gall
|_  =bowl:gall
+*  this   .
    def    ~(. (default-agent this %|) bowl)
::
++  on-leave  on-leave:def
++  on-fail   on-fail:def
::
++  on-save
  ^-  vase
  !>(state)
::
++  on-load
  |=  =vase
  ^-  (quip card _this)
  =/  old  !<(versioned-state:boox vase)
  ?-  -.old
      %2  `this(state old)
  ::
      %1
    `this(state [%2 books.old positions.old book-order.old collections.old ~])
  ::
      %0
    =/  new-colls=(map @t collection:boox)
      %-  ~(run by collections.old)
      |=(bids=(set book-id:boox) `collection:boox`[bids '' %.n %.n ~])
    `this(state [%2 books.old positions.old book-order.old new-colls ~])
  ==
::
++  on-init
  ^-  (quip card _this)
  :_  this
  :~  :*  %pass  /eyre/connect
          %arvo  %e  %connect
          [`/apps/boox/api dap.bowl]
      ==
  ==
::
++  on-poke
  |=  [=mark =vase]
  ^-  (quip card _this)
  |^
  ?+  mark
    (on-poke:def mark vase)
  ::
      %boox-action
    =/  act=action:boox  !<(action:boox vase)
    (handle-action act)
  ::
      %handle-http-request
    (handle-http !<([@ta inbound-request:eyre] vase))
  ==
  ::
  ++  handle-action
    |=  act=action:boox
    ^-  (quip card _this)
    ::  remote-accessible actions (any ship can send)
    ::
    ?:  ?=(%request-shared -.act)
      (handle-request-shared src.bowl)
    ?:  ?=(%shared-data -.act)
      (handle-shared-data from.act data.act)
    ?:  ?=(%receive-book -.act)
      (handle-receive-book src.bowl book.act)
    ::  all remaining actions: owner only
    ::
    ?>  =(src our):bowl
    ?-  -.act
    ::
        %request-shared  !!
        %shared-data     !!
        %receive-book    !!
    ::
        %add-book
      =/  bid  book-id.act
      =/  bk   book.act
      =.  date-added.bk  now.bowl
      =.  books  (~(put by books) bid bk)
      =.  book-order  (snoc book-order bid)
      :_  this
      :~  [%give %fact ~[/updates] boox-update+!>([%book-added bid bk])]
      ==
    ::
        %remove-book
      =/  bid  book-id.act
      =.  books      (~(del by books) bid)
      =.  positions  (~(del by positions) bid)
      =.  book-order  (skip book-order |=(b=book-id:boox =(b bid)))
      =.  collections
        %-  ~(run by collections)
        |=(c=collection:boox c(books (~(del in books.c) bid)))
      :_  this
      :~  [%give %fact ~[/updates] boox-update+!>([%book-removed bid])]
      ==
    ::
        %update-metadata
      =/  bid  book-id.act
      =/  bk=(unit book:boox)  (~(get by books) bid)
      ?~  bk  `this
      =/  new-bk=book:boox
        u.bk(title title.act, author author.act, description description.act, cover-url cover-url.act)
      =.  books  (~(put by books) bid new-bk)
      :_  this
      :~  [%give %fact ~[/updates] boox-update+!>([%metadata-updated bid new-bk])]
      ==
    ::
        %set-position
      =/  bid  book-id.act
      =/  pos=position:boox
        position.act(updated-at now.bowl)
      =.  positions  (~(put by positions) bid pos)
      :_  this
      :~  [%give %fact ~[/updates] boox-update+!>([%position-updated bid pos])]
      ==
    ::
        %add-tag
      =/  bid  book-id.act
      =/  bk=(unit book:boox)  (~(get by books) bid)
      ?~  bk  `this
      =/  new-bk=book:boox
        u.bk(tags (~(put in tags.u.bk) tag.act))
      =.  books  (~(put by books) bid new-bk)
      `this
    ::
        %remove-tag
      =/  bid  book-id.act
      =/  bk=(unit book:boox)  (~(get by books) bid)
      ?~  bk  `this
      =/  new-bk=book:boox
        u.bk(tags (~(del in tags.u.bk) tag.act))
      =.  books  (~(put by books) bid new-bk)
      `this
    ::
        %reorder-books
      =.  book-order  order.act
      :_  this
      :~  [%give %fact ~[/updates] boox-update+!>([%books-reordered order.act])]
      ==
    ::
        %add-to-collection
      =/  coll=collection:boox
        (fall (~(get by collections) name.act) [~ '' %.n %.n ~])
      =.  books.coll  (~(put in books.coll) book-id.act)
      =.  collections  (~(put by collections) name.act coll)
      `this
    ::
        %remove-from-collection
      =/  coll=(unit collection:boox)  (~(get by collections) name.act)
      ?~  coll  `this
      =.  books.u.coll  (~(del in books.u.coll) book-id.act)
      =.  collections  (~(put by collections) name.act u.coll)
      `this
    ::
        %delete-collection
      =.  collections  (~(del by collections) name.act)
      `this
    ::
        %create-collection
      =/  existing=(unit collection:boox)  (~(get by collections) name.act)
      ?^  existing  `this
      =.  collections
        (~(put by collections) name.act [~ description.act %.n %.n ~])
      `this
    ::
        %share-collection
      =/  coll=(unit collection:boox)  (~(get by collections) name.act)
      ?~  coll  `this
      =.  shared.u.coll  %.y
      =.  collections  (~(put by collections) name.act u.coll)
      `this
    ::
        %unshare-collection
      =/  coll=(unit collection:boox)  (~(get by collections) name.act)
      ?~  coll  `this
      =.  shared.u.coll  %.n
      =.  collections  (~(put by collections) name.act u.coll)
      `this
    ::
        %publish-collection
      =/  coll=(unit collection:boox)  (~(get by collections) name.act)
      ?~  coll  `this
      =/  tok=@uv  `@uv`eny.bowl
      =.  public.u.coll  %.y
      =.  share-token.u.coll  `tok
      =.  collections  (~(put by collections) name.act u.coll)
      `this
    ::
        %unpublish-collection
      =/  coll=(unit collection:boox)  (~(get by collections) name.act)
      ?~  coll  `this
      =.  public.u.coll  %.n
      =.  share-token.u.coll  ~
      =.  collections  (~(put by collections) name.act u.coll)
      `this
    ::
        %browse-ship
      :_  this
      :~  :*  %pass  /browse/(scot %p ship.act)
              %agent  [ship.act %boox]
              %poke  %boox-action
              !>(`action:boox`[%request-shared ~])
          ==
      ==
    ::
        %send-book
      =/  bk=(unit book:boox)  (~(get by books) book-id.act)
      ?~  bk  `this
      :_  this
      :~  :*  %pass  /send/(scot %p to.act)
              %agent  [to.act %boox]
              %poke  %boox-action
              !>(`action:boox`[%receive-book our.bowl u.bk])
          ==
      ==
    ::
        %dismiss-pending
      =.  pending  (~(del by pending) pid.act)
      `this
    ==
  ::
  ++  handle-request-shared
    |=  requester=@p
    ^-  (quip card _this)
    =/  data=@t  (en:json:html build-shared-data)
    :_  this
    :~  :*  %pass  /share-response/(scot %p requester)
            %agent  [requester %boox]
            %poke  %boox-action
            !>(`action:boox`[%shared-data our.bowl data])
        ==
    ==
  ::
  ++  handle-shared-data
    |=  [from=@p data=@t]
    ^-  (quip card _this)
    =/  jon=(unit json)  (de:json:html data)
    ?~  jon  `this
    =.  remote-cache  (~(put by remote-cache) from u.jon)
    `this
  ::
  ++  handle-receive-book
    |=  [from=@p bk=book:boox]
    ^-  (quip card _this)
    =/  pid=@uv  `@uv`eny.bowl
    =.  pending  (~(put by pending) pid [from bk now.bowl])
    `this
  ::
  ++  build-shared-data
    ^-  json
    =/  shared-colls=(list [@t collection:boox])
      (skim ~(tap by collections) |=([* c=collection:boox] shared.c))
    %-  pairs:enjs:format
    :~  ['ship' s+(scot %p our.bowl)]
        :-  'collections'
        :-  %a
        %+  turn  shared-colls
        |=  [name=@t c=collection:boox]
        %-  pairs:enjs:format
        :~  ['name' s+name]
            ['description' s+description.c]
            :-  'books'
            :-  %a
            %+  murn  ~(tap in books.c)
            |=  bid=book-id:boox
            =/  bk=(unit book:boox)  (~(get by books) bid)
            ?~  bk  ~
            :-  ~
            %-  pairs:enjs:format
            :~  ['id' s+(scot %uv bid)]
                ['title' s+title.u.bk]
                ['author' s+author.u.bk]
                ['format' s+(format-to-cord format.u.bk)]
                ['s3-url' s+s3-url.u.bk]
                ['cover-url' s+cover-url.u.bk]
                ['file-size' (numb:enjs:format file-size.u.bk)]
                ['description' s+description.u.bk]
                ['tags' [%a (turn ~(tap in tags.u.bk) |=(t=@t s+t))]]
            ==
        ==
    ==
  ::
  ::  HTTP request handling
  ::
  ++  handle-http
    |=  [eyre-id=@ta req=inbound-request:eyre]
    ^-  (quip card _this)
    =/  rl=request-line:server
      (parse-request-line:server url.request.req)
    =/  site=(list @t)  site.rl
    =/  site=(list @t)
      ?.  ?=([%apps %boox %api *] site)
        site
      t.t.t.site
    ::  re-attach extension to last segment for API routes
    =/  site=(list @t)
      ?~  ext.rl  site
      ?~  site    site
      %+  snoc
        (scag (dec (lent site)) `(list @t)`site)
      (crip "{(trip (rear site))}.{(trip u.ext.rl)}")
    ::  public endpoints: no auth required
    ::
    ?:  ?=([%public *] site)
      ?:  ?=(%'OPTIONS' method.request.req)
        :_  this
        %+  give-simple-payload:app:server  eyre-id
        :_  ~
        :-  204
        :~  ['access-control-allow-origin' '*']
            ['access-control-allow-methods' 'GET, OPTIONS']
            ['access-control-allow-headers' 'Content-Type']
            ['access-control-max-age' '86400']
        ==
      ?.  ?=(%'GET' method.request.req)
        :_  this
        %+  give-simple-payload:app:server  eyre-id
        [[405 ~] ~]
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      (handle-public t.site)
    ::  all other endpoints require auth
    ::
    ?.  authenticated.req
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      (login-redirect:gen:server request.req)
    ?+  method.request.req
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      [[405 ~] ~]
    ::
        %'GET'
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      (handle-scry site)
    ::
        %'POST'
      (handle-poke eyre-id req)
    ==
  ::
  ::  public (unauthenticated) endpoint handlers
  ::
  ++  handle-public
    |=  site=(list @t)
    ^-  simple-payload:http
    ?+  site
      not-found:gen:server
    ::
    ::  list all public collections
    ::
        [%collections ~]
      =/  pub-colls=(list [@t collection:boox])
        (skim ~(tap by collections) |=([* c=collection:boox] public.c))
      %-  public-json-response
      %-  pairs:enjs:format
      :~  ['ship' s+(scot %p our.bowl)]
          :-  'collections'
          :-  %a
          %+  turn  pub-colls
          |=  [name=@t c=collection:boox]
          %-  pairs:enjs:format
          :~  ['name' s+name]
              ['description' s+description.c]
              ['book-count' (numb:enjs:format ~(wyt in books.c))]
              :-  'token'
              ?~  share-token.c  ~
              s+(scot %uv u.share-token.c)
          ==
      ==
    ::
    ::  get a specific shared collection by token
    ::
        [@ ~]
      =/  tok=(unit @uv)  (slaw %uv i.site)
      ?~  tok  not-found:gen:server
      =/  found=(unit [@t collection:boox])
        %-  ~(rep by collections)
        |=  [[name=@t c=collection:boox] found=(unit [@t collection:boox])]
        ?^  found  found
        ?.  ?&  public.c
                ?=(^ share-token.c)
                =(u.share-token.c u.tok)
            ==
          found
        `[name c]
      ?~  found  not-found:gen:server
      =/  [coll-name=@t coll=collection:boox]  u.found
      =/  coll-books=(list [book-id:boox book:boox])
        %+  murn  ~(tap in books.coll)
        |=  bid=book-id:boox
        =/  bk=(unit book:boox)  (~(get by books) bid)
        ?~  bk  ~
        `[bid u.bk]
      %-  public-json-response
      %-  pairs:enjs:format
      :~  ['ship' s+(scot %p our.bowl)]
          ['name' s+coll-name]
          ['description' s+description.coll]
          :-  'books'
          :-  %a
          %+  turn  coll-books
          |=  [bid=book-id:boox bk=book:boox]
          %-  pairs:enjs:format
          :~  ['id' s+(scot %uv bid)]
              ['title' s+title.bk]
              ['author' s+author.bk]
              ['format' s+(format-to-cord format.bk)]
              ['s3-url' s+s3-url.bk]
              ['cover-url' s+cover-url.bk]
              ['file-size' (numb:enjs:format file-size.bk)]
              ['date-added' (sect:enjs:format date-added.bk)]
              ['description' s+description.bk]
              ['tags' [%a (turn ~(tap in tags.bk) |=(t=@t s+t))]]
          ==
      ==
    ::
    ::  serve shared collection HTML page
    ::
        [@ %page ~]
      =/  tok-cord=@t  i.site
      =/  api-path=tape  "/apps/boox/api/public/{(trip tok-cord)}"
      =/  page=tape
        ;:  welp
          "<!DOCTYPE html><html lang=en><head>"
          "<meta charset=UTF-8>"
          "<meta name=viewport content='width=device-width,initial-scale=1'>"
          "<meta name=robots content='noindex,nofollow'>"
          "<title>Shared Collection - Boox</title>"
          "<link href='https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&display=swap' rel=stylesheet>"
          "<style>"
          "*,*::before,*::after\{box-sizing:border-box;margin:0;padding:0}"
          "body\{font-family:'Hanken Grotesk',-apple-system,system-ui,sans-serif;"
          "background:#0F0F0F;color:#E8E8E6;min-height:100vh;padding:2rem 1.5rem;"
          "-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.5}"
          ".w\{max-width:900px;margin:0 auto}"
          ".sh\{color:#5A5A58;font-size:.8rem;font-family:monospace;margin-bottom:.25rem}"
          "h1\{font-size:1.5rem;font-weight:600;margin-bottom:.25rem;letter-spacing:-.02em}"
          ".dc\{color:#8A8A87;margin-bottom:2rem;font-size:.9rem}"
          ".g\{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:1.25rem}"
          ".c\{transition:transform 150ms ease}.c:hover\{transform:translateY(-2px)}"
          ".cv\{aspect-ratio:2/3;background:#1E1E1C;border-radius:8px;overflow:hidden;"
          "position:relative;border:1px solid #2A2A28;margin-bottom:.5rem}"
          ".cv img\{width:100%;height:100%;object-fit:cover}"
          ".ph\{display:flex;align-items:center;justify-content:center;height:100%;"
          "padding:.75rem;text-align:center;font-size:.8rem;font-weight:600;color:#E8E8E6;line-height:1.3}"
          ".bg\{position:absolute;bottom:.4rem;right:.4rem;background:rgba(0,0,0,.6);"
          "color:#fff;padding:.15rem .45rem;border-radius:999px;font-size:.6rem;"
          "font-weight:600;text-transform:uppercase;backdrop-filter:blur(4px)}"
          ".m\{padding:0 .1rem}"
          ".t\{font-size:.8rem;font-weight:600;white-space:nowrap;overflow:hidden;"
          "text-overflow:ellipsis;margin-bottom:.1rem}"
          ".a\{font-size:.7rem;color:#8A8A87}"
          ".ld\{text-align:center;padding:4rem;color:#8A8A87}"
          ".er\{text-align:center;padding:4rem;color:#ef4444}"
          ".pw\{margin-top:3rem;text-align:center;font-size:.7rem;color:#5A5A58;"
          "border-top:1px solid #2A2A28;padding-top:1.5rem}"
          ".pw a\{color:#8A8A87;text-decoration:none}.pw a:hover\{color:#E8E8E6}"
          ".ht\{background:#1A1A18;border:1px solid #2A2A28;border-radius:8px;"
          "padding:1rem;margin-bottom:2rem;font-size:.85rem;color:#8A8A87}"
          "</style></head><body><div class=w id=app>"
          "<div class=ld>Loading collection...</div></div>"
          "<script>"
          "fetch('"
          api-path
          "').then(function(r)\{if(!r.ok)throw new Error('Not found');return r.json()})"
          ".then(function(d)\{"
          "var a=document.getElementById('app'),h='';"
          "h+='<div class=sh>'+e(d.ship)+'</div>';"
          "h+='<h1>'+e(d.name)+'</h1>';"
          "if(d.description)h+='<p class=dc>'+e(d.description)+'</p>';"
          "h+='<div class=ht>This collection has <strong>'+d.books.length+'</strong> book'+"
          "(d.books.length!==1?'s':'')+'. If you have Boox on your Urbit ship, you can import these from the <strong>Collections</strong> tab.</div>';"
          "h+='<div class=g>';"
          "d.books.forEach(function(b)\{"
          "h+='<div class=c><div class=cv>';"
          "if(b['cover-url'])h+='<img src=\"'+e(b['cover-url'])+'\" loading=lazy>';"
          "else h+='<div class=ph>'+e(b.title).slice(0,40)+'</div>';"
          "h+='<span class=bg>'+e(b.format)+'</span></div>';"
          "h+='<div class=m><div class=t>'+e(b.title)+'</div>';"
          "h+='<div class=a>'+e(b.author||'Unknown')+'</div></div></div>';"
          "});"
          "h+='</div><div class=pw>Shared via <a href=https://urbit.org>Urbit</a> / Boox</div>';"
          "a.innerHTML=h})"
          ".catch(function(x)\{document.getElementById('app').innerHTML='<div class=er>'+e(x.message)+'</div>'});"
          "function e(s)\{if(!s)return '';var d=document.createElement('div');d.textContent=s;return d.innerHTML}"
          "</script></body></html>"
        ==
      =/  bod  (as-octs:mimes:html (crip page))
      :_  `bod
      :-  200
      :~  ['content-type' 'text/html']
          ['x-robots-tag' 'noindex, nofollow']
          ['access-control-allow-origin' '*']
      ==
    ==
  ::
  ++  public-json-response
    |=  =json
    ^-  simple-payload:http
    =/  bod  (as-octs:mimes:html (en:json:html json))
    :_  `bod
    :-  200
    :~  ['content-type' 'application/json']
        ['access-control-allow-origin' '*']
        ['x-robots-tag' 'noindex, nofollow']
    ==
  ::
  ++  handle-scry
    |=  site=(list @t)
    ^-  simple-payload:http
    ?+  site
      not-found:gen:server
    ::
        [%books ~]
      =/  all-books=(list [book-id:boox book:boox])  ~(tap by books)
      =/  ordered=(list [book-id:boox book:boox])
        ?~  book-order  all-books
        =/  bk-map=(map book-id:boox book:boox)  books
        =/  in-order=(list [book-id:boox book:boox])
          %+  murn  book-order
          |=  bid=book-id:boox
          =/  bk=(unit book:boox)  (~(get by bk-map) bid)
          ?~  bk  ~
          `[bid u.bk]
        =/  order-set=(set book-id:boox)
          (~(gas in *(set book-id:boox)) book-order)
        =/  rest=(list [book-id:boox book:boox])
          (skip all-books |=([bid=book-id:boox *] (~(has in order-set) bid)))
        (welp in-order rest)
      %-  json-response:gen:server
      %-  pairs:enjs:format
      :~  :-  'books'
          :-  %a
          %+  turn  ordered
          |=  [bid=book-id:boox bk=book:boox]
          =/  pos=(unit position:boox)  (~(get by positions) bid)
          %-  pairs:enjs:format
          :~  ['id' s+(scot %uv bid)]
              ['title' s+title.bk]
              ['author' s+author.bk]
              ['format' s+(format-to-cord format.bk)]
              ['s3-url' s+s3-url.bk]
              ['cover-url' s+cover-url.bk]
              ['file-size' (numb:enjs:format file-size.bk)]
              ['date-added' (sect:enjs:format date-added.bk)]
              ['description' s+description.bk]
              :-  'tags'
              [%a (turn ~(tap in tags.bk) |=(t=@t s+t))]
              :-  'position'
              ?~  pos  ~
              %-  pairs:enjs:format
              :~  ['value' s+value.u.pos]
                  ['progress' (numb:enjs:format progress.u.pos)]
                  ['updated-at' (sect:enjs:format updated-at.u.pos)]
              ==
          ==
      ==
    ::
        [%book @ ~]
      =/  bid=(unit book-id:boox)  (slaw %uv i.t.site)
      ?~  bid  not-found:gen:server
      =/  bk=(unit book:boox)  (~(get by books) u.bid)
      ?~  bk  not-found:gen:server
      =/  pos=(unit position:boox)  (~(get by positions) u.bid)
      %-  json-response:gen:server
      %-  pairs:enjs:format
      :~  ['id' s+(scot %uv u.bid)]
          ['title' s+title.u.bk]
          ['author' s+author.u.bk]
          ['format' s+(format-to-cord format.u.bk)]
          ['s3-url' s+s3-url.u.bk]
          ['cover-url' s+cover-url.u.bk]
          ['file-size' (numb:enjs:format file-size.u.bk)]
          ['date-added' (sect:enjs:format date-added.u.bk)]
          ['description' s+description.u.bk]
          :-  'tags'
          [%a (turn ~(tap in tags.u.bk) |=(t=@t s+t))]
          :-  'position'
          ?~  pos  ~
          %-  pairs:enjs:format
          :~  ['value' s+value.u.pos]
              ['progress' (numb:enjs:format progress.u.pos)]
              ['updated-at' (sect:enjs:format updated-at.u.pos)]
          ==
      ==
    ::
        [%'s3-config' ~]
      =/  get-str
        |=  [=json keys=(list @t)]
        ^-  @t
        ?~  keys  ?:(?=([%s *] json) p.json '')
        ?.  ?=([%o *] json)  ''
        =/  v  (~(get by p.json) i.keys)
        ?~  v  ''
        $(json u.v, keys t.keys)
      =/  cred-json=json
        .^(json %gx /(scot %p our.bowl)/storage/(scot %da now.bowl)/credentials/json)
      =/  conf-json=json
        .^(json %gx /(scot %p our.bowl)/storage/(scot %da now.bowl)/configuration/json)
      %-  json-response:gen:server
      %-  pairs:enjs:format
      :~  ['endpoint' s+(get-str cred-json ~['storage-update' 'credentials' 'endpoint'])]
          ['accessKeyId' s+(get-str cred-json ~['storage-update' 'credentials' 'accessKeyId'])]
          ['secretAccessKey' s+(get-str cred-json ~['storage-update' 'credentials' 'secretAccessKey'])]
          ['bucket' s+(get-str conf-json ~['storage-update' 'configuration' 'currentBucket'])]
          ['region' s+(get-str conf-json ~['storage-update' 'configuration' 'region'])]
          ['publicUrlBase' s+(get-str conf-json ~['storage-update' 'configuration' 'publicUrlBase'])]
          ['presignedUrl' s+(get-str conf-json ~['storage-update' 'configuration' 'presignedUrl'])]
          ['service' s+(get-str conf-json ~['storage-update' 'configuration' 'service'])]
      ==
    ::
        [%collections ~]
      %-  json-response:gen:server
      %-  pairs:enjs:format
      :~  :-  'collections'
          %-  pairs:enjs:format
          %+  turn  ~(tap by collections)
          |=  [name=@t c=collection:boox]
          :-  name
          %-  pairs:enjs:format
          :~  :-  'books'
              [%a (turn ~(tap in books.c) |=(b=book-id:boox s+(scot %uv b)))]
              ['description' s+description.c]
              ['shared' b+shared.c]
              ['public' b+public.c]
              :-  'share-token'
              ?~  share-token.c  ~
              s+(scot %uv u.share-token.c)
          ==
      ==
    ::
        [%pals ~]
      =/  ships=(list @p)
        =/  res=(unit (set @p))
          %-  mole
          |.(.^((set @p) %gx /(scot %p our.bowl)/pals/(scot %da now.bowl)/mutuals/noun))
        ?~  res  ~
        ~(tap in u.res)
      %-  json-response:gen:server
      %-  pairs:enjs:format
      :~  :-  'pals'
          [%a (turn ships |=(s=@p s+(scot %p s)))]
      ==
    ::
        [%remote @ ~]
      =/  ship=(unit @p)  (slaw %p i.t.site)
      ?~  ship  not-found:gen:server
      =/  cached=(unit json)  (~(get by remote-cache) u.ship)
      ?~  cached
        %-  json-response:gen:server
        (pairs:enjs:format ~[['status' s+'loading']])
      (json-response:gen:server u.cached)
    ::
        [%pending ~]
      %-  json-response:gen:server
      %-  pairs:enjs:format
      :~  :-  'pending'
          :-  %a
          %+  turn  ~(tap by pending)
          |=  [pid=@uv pb=pending-book:boox]
          %-  pairs:enjs:format
          :~  ['pid' s+(scot %uv pid)]
              ['from' s+(scot %p from.pb)]
              ['title' s+title.book.pb]
              ['author' s+author.book.pb]
              ['format' s+(format-to-cord format.book.pb)]
              ['s3-url' s+s3-url.book.pb]
              ['cover-url' s+cover-url.book.pb]
              ['file-size' (numb:enjs:format file-size.book.pb)]
              ['description' s+description.book.pb]
              ['tags' [%a (turn ~(tap in tags.book.pb) |=(t=@t s+t))]]
              ['received-at' (sect:enjs:format received-at.pb)]
          ==
      ==
    ==
  ::
  ++  handle-poke
    |=  [eyre-id=@ta req=inbound-request:eyre]
    ^-  (quip card _this)
    =/  body=(unit octs)  body.request.req
    ?~  body
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      [[400 ~] ~]
    =/  jon=(unit json)  (de:json:html q.u.body)
    ?~  jon
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      [[400 ~] ~]
    =/  act=(unit action:boox)
      %-  mole
      |.((json:grab:boox-action-mark u.jon))
    ?~  act
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      [[400 ~] ~]
    =/  [cards=(list card) new-this=_this]
      (handle-action u.act)
    :_  new-this
    %+  welp
      %+  give-simple-payload:app:server  eyre-id
      %-  json-response:gen:server
      (pairs:enjs:format ~[['ok' b+%.y]])
    cards
  ::
  ++  boox-action-mark
    |_  act=action:boox
    ++  grab
      |%
      ++  json
        |=  jon=^json
        ^-  action:boox
        =,  dejs:format
        =/  typ=@t  ((ot ~[action+so]) jon)
        ?+  typ  !!
            %'add-book'
          =/  f
            %-  ot
            :~  book-id+(se %uv)
                title+so
                author+so
                format+so
                s3-url+so
                cover-url+so
                file-size+ni
                tags+(ar so)
                description+so
            ==
          =/  [bid=@uv tit=@t aut=@t fmt=@t url=@t cov=@t siz=@ud tgs=(list @t) desc=@t]
            (f jon)
          =/  fmt-type=format:boox
            ?+  fmt  %txt
              %'pdf'   %pdf
              %'epub'  %epub
              %'mobi'  %mobi
              %'txt'   %txt
              %'md'    %md
              %'html'  %html
            ==
          :*  %add-book  bid
              :*  tit  aut  fmt-type  url  cov  siz
                  *@da
                  (~(gas in *(set @t)) tgs)
                  desc
              ==
          ==
        ::
            %'remove-book'
          [%remove-book ((ot ~[book-id+(se %uv)]) jon)]
        ::
            %'update-metadata'
          =/  f  (ot ~[book-id+(se %uv) title+so author+so description+so cover-url+so])
          =/  [bid=@uv tit=@t aut=@t desc=@t cov=@t]  (f jon)
          [%update-metadata bid tit aut desc cov]
        ::
            %'set-position'
          =/  f  (ot ~[book-id+(se %uv) value+so progress+ni])
          =/  [bid=@uv val=@t prog=@ud]  (f jon)
          [%set-position bid [val prog *@da]]
        ::
            %'add-tag'
          =/  f  (ot ~[book-id+(se %uv) tag+so])
          =/  [bid=@uv tag=@t]  (f jon)
          [%add-tag bid tag]
        ::
            %'remove-tag'
          =/  f  (ot ~[book-id+(se %uv) tag+so])
          =/  [bid=@uv tag=@t]  (f jon)
          [%remove-tag bid tag]
        ::
            %'reorder-books'
          =/  order=(list book-id:boox)
            ((ot ~[order+(ar (se %uv))]) jon)
          [%reorder-books order]
        ::
            %'add-to-collection'
          =/  f  (ot ~[name+so book-id+(se %uv)])
          =/  [name=@t bid=@uv]  (f jon)
          [%add-to-collection name bid]
        ::
            %'remove-from-collection'
          =/  f  (ot ~[name+so book-id+(se %uv)])
          =/  [name=@t bid=@uv]  (f jon)
          [%remove-from-collection name bid]
        ::
            %'delete-collection'
          [%delete-collection ((ot ~[name+so]) jon)]
        ::
            %'create-collection'
          =/  f  (ot ~[name+so description+so])
          =/  [name=@t desc=@t]  (f jon)
          [%create-collection name desc]
        ::
            %'share-collection'
          [%share-collection ((ot ~[name+so]) jon)]
        ::
            %'unshare-collection'
          [%unshare-collection ((ot ~[name+so]) jon)]
        ::
            %'publish-collection'
          [%publish-collection ((ot ~[name+so]) jon)]
        ::
            %'unpublish-collection'
          [%unpublish-collection ((ot ~[name+so]) jon)]
        ::
            %'browse-ship'
          [%browse-ship ((ot ~[ship+(se %p)]) jon)]
        ::
            %'send-book'
          =/  f  (ot ~[book-id+(se %uv) to+(se %p)])
          =/  [bid=@uv to=@p]  (f jon)
          [%send-book bid to]
        ::
            %'dismiss-pending'
          [%dismiss-pending ((ot ~[pid+(se %uv)]) jon)]
        ==
      --
    --
  --
::
++  on-watch
  |=  =path
  ^-  (quip card _this)
  ?+  path
    (on-watch:def path)
  ::
      [%http-response @ ~]
    [~ this]
  ::
      [%updates ~]
    ?>  =(src our):bowl
    [~ this]
  ==
::
++  on-agent
  |=  [=wire =sign:agent:gall]
  ^-  (quip card _this)
  ?+  wire  (on-agent:def wire sign)
  ::
      [%browse @ ~]
    ?+  -.sign  (on-agent:def wire sign)
        %poke-ack
      ?~  p.sign  `this
      ::  poke failed - store error in cache
      =/  ship=(unit @p)  (slaw %p i.t.wire)
      ?~  ship  `this
      =/  err=json
        (pairs:enjs:format ~[['status' s+'error'] ['message' s+'Ship not reachable or Boox not installed']])
      =.  remote-cache  (~(put by remote-cache) u.ship err)
      `this
    ==
  ::
      [%send @ ~]
    ?+  -.sign  (on-agent:def wire sign)
        %poke-ack
      ?~  p.sign  `this
      ~&  [%send-book-failed u.p.sign]
      `this
    ==
  ::
      [%share-response @ ~]
    ?+  -.sign  (on-agent:def wire sign)
        %poke-ack
      `this
    ==
  ==
::
++  on-peek
  |=  =path
  ^-  (unit (unit cage))
  ?+  path  ~
  ::
  ::  shared collections listing (for remote scry)
  ::
      [%x %shared %collections ~]
    =/  shared-colls=(list [@t collection:boox])
      (skim ~(tap by collections) |=([* c=collection:boox] shared.c))
    =/  jon=json
      %-  pairs:enjs:format
      :~  ['ship' s+(scot %p our.bowl)]
          :-  'collections'
          :-  %a
          %+  turn  shared-colls
          |=  [name=@t c=collection:boox]
          %-  pairs:enjs:format
          :~  ['name' s+name]
              ['description' s+description.c]
              ['book-count' (numb:enjs:format ~(wyt in books.c))]
          ==
      ==
    ``json+!>(jon)
  ::
  ::  shared collection books (for remote scry)
  ::
      [%x %shared %collection @ %books ~]
    =/  name=@t  i.t.t.t.path
    =/  coll=(unit collection:boox)  (~(get by collections) name)
    ?~  coll  ~
    ?.  shared.u.coll  ~
    =/  coll-books=(list [book-id:boox book:boox])
      %+  murn  ~(tap in books.u.coll)
      |=  bid=book-id:boox
      =/  bk=(unit book:boox)  (~(get by books) bid)
      ?~  bk  ~
      `[bid u.bk]
    =/  jon=json
      %-  pairs:enjs:format
      :~  ['name' s+name]
          ['description' s+description.u.coll]
          :-  'books'
          :-  %a
          %+  turn  coll-books
          |=  [bid=book-id:boox bk=book:boox]
          %-  pairs:enjs:format
          :~  ['id' s+(scot %uv bid)]
              ['title' s+title.bk]
              ['author' s+author.bk]
              ['format' s+(format-to-cord format.bk)]
              ['s3-url' s+s3-url.bk]
              ['cover-url' s+cover-url.bk]
              ['file-size' (numb:enjs:format file-size.bk)]
              ['date-added' (sect:enjs:format date-added.bk)]
              ['description' s+description.bk]
              ['tags' [%a (turn ~(tap in tags.bk) |=(t=@t s+t))]]
          ==
      ==
    ``json+!>(jon)
  ==
::
++  on-arvo
  |=  [=wire sign=sign-arvo]
  ^-  (quip card _this)
  ?+  wire  (on-arvo:def wire sign)
      [%eyre %connect ~]
    ?>  ?=(%bound +<.sign)
    ~?  !accepted.sign  [dap.bowl %binding-rejected binding.sign]
    [~ this]
  ==
--
