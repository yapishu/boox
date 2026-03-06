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
--
::
%-  agent:dbug
=|  state-0:boox
=*  state  -
%+  verb  |
^-  agent:gall
|_  =bowl:gall
+*  this   .
    def    ~(. (default-agent this %|) bowl)
::
++  on-agent  on-agent:def
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
  =/  old  !<(state-0:boox vase)
  `this(state old)
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
    ?>  =(src our):bowl
    ?-  -.act
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
        |=(s=(set book-id:boox) (~(del in s) bid))
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
      =/  existing=(set book-id:boox)
        (fall (~(get by collections) name.act) ~)
      =.  collections
        (~(put by collections) name.act (~(put in existing) book-id.act))
      `this
    ::
        %remove-from-collection
      =/  existing=(set book-id:boox)
        (fall (~(get by collections) name.act) ~)
      =.  collections
        (~(put by collections) name.act (~(del in existing) book-id.act))
      `this
    ::
        %delete-collection
      =.  collections  (~(del by collections) name.act)
      `this
    ==
  ::
  ::  HTTP request handling
  ::
  ++  handle-http
    |=  [eyre-id=@ta req=inbound-request:eyre]
    ^-  (quip card _this)
    ?.  authenticated.req
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      (login-redirect:gen:server request.req)
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
    ::  scry system %storage agent for S3 config
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
          |=  [name=@t bids=(set book-id:boox)]
          :-  name
          [%a (turn ~(tap in bids) |=(b=book-id:boox s+(scot %uv b)))]
      ==
    ==
  ::
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
        ==
      --
    --
  --
::
++  on-watch
  |=  =path
  ^-  (quip card _this)
  ?>  ?=([%http-response @ ~] path)
  [~ this]
::
++  on-peek
  |=(* ~)
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
