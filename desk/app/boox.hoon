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
++  format-to-mime
  |=  fmt=format:boox
  ^-  @t
  ?-  fmt
    %pdf   'application/pdf'
    %epub  'application/epub+zip'
    %mobi  'application/x-mobipocket-ebook'
    %txt   'text/plain'
    %md    'text/markdown'
    %html  'text/html'
  ==
::
++  xml-escape
  |=  t=tape
  ^-  tape
  %-  zing
  %+  turn  t
  |=  c=@t
  ?+  c  [c ~]
    %'&'   "&amp;"
    %'<'   "&lt;"
    %'>'   "&gt;"
    %'"'   "&quot;"
    %'\''  "&apos;"
  ==
::
++  opds-response
  |=  body=tape
  ^-  simple-payload:http
  :_  `(as-octs:mimes:html (crip body))
  :-  200
  :~  ['content-type' 'application/atom+xml;profile=opds-catalog;charset=utf-8']
  ==
::
++  opds-book-entry
  |=  [bid=book-id:boox bk=book:boox base=tape]
  ^-  tape
  =/  desc=tape
    ?:  =('' description.bk)  ""
    "<summary>{(xml-escape (trip description.bk))}</summary>"
  =/  cover=tape
    ?:  =('' cover-url.bk)  ""
    "<link rel=\"http://opds-spec.org/image\" href=\"{(xml-escape (trip cover-url.bk))}\" type=\"image/jpeg\"/>"
  =/  acq=tape
    ?:  =('' s3-url.bk)  ""
    "<link rel=\"http://opds-spec.org/acquisition\" href=\"{(xml-escape (trip s3-url.bk))}\" type=\"{(trip (format-to-mime format.bk))}\"/>"
  =/  cats=tape
    %-  zing
    %+  turn  ~(tap in tags.bk)
    |=  tag=@t
    "<category term=\"{(xml-escape (trip tag))}\"/>"
  ;:  welp
    "<entry>"
    "<title>{(xml-escape (trip title.bk))}</title>"
    "<id>urn:urbit:boox:{(trip (scot %uv bid))}</id>"
    "<author><name>{(xml-escape (trip author.bk))}</name></author>"
    desc
    cover
    acq
    cats
    "</entry>"
  ==
::
++  opds-root
  |=  [ship=tape base=tape colls=(map @t collection:boox)]
  ^-  simple-payload:http
  =/  header=tape
    ;:  welp
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      "<feed xmlns=\"http://www.w3.org/2005/Atom\" "
      "xmlns:opds=\"http://opds-spec.org/2010/catalog\">"
      "<id>urn:urbit:boox:{ship}:root</id>"
      "<title>Boox on {ship}</title>"
      "<author><name>{ship}</name></author>"
      "<link rel=\"self\" href=\"{base}/opds\" type=\"application/atom+xml;profile=opds-catalog;kind=navigation\"/>"
      "<link rel=\"start\" href=\"{base}/opds\" type=\"application/atom+xml;profile=opds-catalog;kind=navigation\"/>"
    ==
  =/  all-entry=tape
    ;:  welp
      "<entry>"
      "<title>All Books</title>"
      "<id>urn:urbit:boox:{ship}:all</id>"
      "<link rel=\"subsection\" href=\"{base}/opds/all\" type=\"application/atom+xml;profile=opds-catalog;kind=acquisition\"/>"
      "<content type=\"text\">Browse your entire library</content>"
      "</entry>"
    ==
  =/  coll-entries=tape
    %-  zing
    %+  turn  ~(tap by colls)
    |=  [name=@t c=collection:boox]
    =/  cdesc=tape
      ?:  =('' description.c)  ""
      "<content type=\"text\">{(xml-escape (trip description.c))}</content>"
    ;:  welp
      "<entry>"
      "<title>{(xml-escape (trip name))}</title>"
      "<id>urn:urbit:boox:{ship}:collection:{(xml-escape (trip name))}</id>"
      "<link rel=\"subsection\" href=\"{base}/opds/collection/{(xml-escape (trip name))}\" type=\"application/atom+xml;profile=opds-catalog;kind=acquisition\"/>"
      cdesc
      "</entry>"
    ==
  %-  opds-response
  ;:  welp
    header
    all-entry
    coll-entries
    "</feed>"
  ==
::
++  opds-all-books
  |=  [ship=tape base=tape order=(list book-id:boox) bks=(map book-id:boox book:boox)]
  ^-  simple-payload:http
  =/  ordered=(list [book-id:boox book:boox])
    %+  murn  order
    |=  bid=book-id:boox
    =/  bk=(unit book:boox)  (~(get by bks) bid)
    ?~  bk  ~
    `[bid u.bk]
  =/  header=tape
    ;:  welp
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      "<feed xmlns=\"http://www.w3.org/2005/Atom\" "
      "xmlns:opds=\"http://opds-spec.org/2010/catalog\">"
      "<id>urn:urbit:boox:{ship}:all</id>"
      "<title>All Books</title>"
      "<author><name>{ship}</name></author>"
      "<link rel=\"self\" href=\"{base}/opds/all\" type=\"application/atom+xml;profile=opds-catalog;kind=acquisition\"/>"
      "<link rel=\"up\" href=\"{base}/opds\" type=\"application/atom+xml;profile=opds-catalog;kind=navigation\"/>"
    ==
  =/  entries=tape
    %-  zing
    %+  turn  ordered
    |=  [bid=book-id:boox bk=book:boox]
    (opds-book-entry bid bk base)
  %-  opds-response
  ;:  welp  header  entries  "</feed>"  ==
::
++  opds-collection-feed
  |=  [name=@t ship=tape base=tape coll=collection:boox bks=(map book-id:boox book:boox)]
  ^-  simple-payload:http
  =/  coll-books=(list [book-id:boox book:boox])
    %+  murn  ~(tap in books.coll)
    |=  bid=book-id:boox
    =/  bk=(unit book:boox)  (~(get by bks) bid)
    ?~  bk  ~
    `[bid u.bk]
  =/  header=tape
    ;:  welp
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      "<feed xmlns=\"http://www.w3.org/2005/Atom\" "
      "xmlns:opds=\"http://opds-spec.org/2010/catalog\">"
      "<id>urn:urbit:boox:{ship}:collection:{(xml-escape (trip name))}</id>"
      "<title>{(xml-escape (trip name))}</title>"
      "<author><name>{ship}</name></author>"
      "<link rel=\"self\" href=\"{base}/opds/collection/{(xml-escape (trip name))}\" type=\"application/atom+xml;profile=opds-catalog;kind=acquisition\"/>"
      "<link rel=\"up\" href=\"{base}/opds\" type=\"application/atom+xml;profile=opds-catalog;kind=navigation\"/>"
    ==
  =/  entries=tape
    %-  zing
    %+  turn  coll-books
    |=  [bid=book-id:boox bk=book:boox]
    (opds-book-entry bid bk base)
  %-  opds-response
  ;:  welp  header  entries  "</feed>"  ==
--
::
%-  agent:dbug
=|  state-10:boox
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
  ::  disconnect stale /apps/boox binding if it exists
  ::  (was accidentally bound in a previous on-init)
  ::
  ::  take over stale /apps/boox binding from old %boox-fileserver
  ::  re-bind first to claim the duct, then disconnect to free for docket
  ::
  =/  cleanup=(list card)
    :~  ::  claim then release stale /apps/boox binding so docket can serve
        [%pass /eyre/takeover %arvo %e %connect [~ /apps/boox] dap.bowl]
        [%pass /eyre/takeover %arvo %e %disconnect [~ /apps/boox]]
        ::  bind our API endpoint
        [%pass /eyre/connect %arvo %e %connect [`/apps/boox/api dap.bowl]]
    ==
  ::  backfill: HEAD s3 urls for books missing hashes
  =/  backfill-cards=(list card)
    |^
    =/  remaining=(list book-id:boox)  book-order.old
    =/  acc=(list card)  ~
    |-
    ?~  remaining  acc
    =/  bid  i.remaining
    ?:  (~(has by hashes) bid)  $(remaining t.remaining)
    =/  bk=(unit book:boox)  (~(get by books.old) bid)
    ?~  bk  $(remaining t.remaining)
    ?:  =('' s3-url.u.bk)  $(remaining t.remaining)
    =/  req=request:http  [%'HEAD' s3-url.u.bk ~ ~]
    %=  $
      remaining  t.remaining
      acc  [[%pass /backfill/(scot %uv bid) %arvo %i %request req *outbound-config:iris] acc]
    ==
    ++  hashes
      ?+  -.old
        *(map book-id:boox @t)
          %10  book-hashes.old
          %9   book-hashes.old
      ==
    --
  ?-  -.old
      %10  [(weld cleanup backfill-cards) this(state old)]
  ::
      %9
    [(weld cleanup backfill-cards) this(state [%10 books.old positions.old book-order.old collections.old pending.old opds-enabled.old opds-password.old readable-colls.old notations.old last-scrobble.old last-scrobble-upload.old book-hashes.old ~ 'annas-archive.gl'])]
  ::
      %8
    [cleanup this(state [%10 books.old positions.old book-order.old collections.old pending.old opds-enabled.old opds-password.old readable-colls.old notations.old last-scrobble.old last-scrobble-upload.old ~ ~ 'annas-archive.gl'])]
  ::
      %7
    [cleanup this(state [%10 books.old positions.old book-order.old collections.old pending.old opds-enabled.old opds-password.old readable-colls.old notations.old last-scrobble.old %.y ~ ~ 'annas-archive.gl'])]
  ::
      %6
    [cleanup this(state [%10 books.old positions.old book-order.old collections.old pending.old opds-enabled.old opds-password.old readable-colls.old notations.old %.n %.y ~ ~ 'annas-archive.gl'])]
  ::
      %5
    [cleanup this(state [%10 books.old positions.old book-order.old collections.old pending.old opds-enabled.old opds-password.old readable-colls.old ~ %.n %.y ~ ~ 'annas-archive.gl'])]
  ::
      %4
    [cleanup this(state [%10 books.old positions.old book-order.old collections.old pending.old opds-enabled.old opds-password.old ~ ~ %.n %.y ~ ~ 'annas-archive.gl'])]
  ::
      %3
    [cleanup this(state [%10 books.old positions.old book-order.old collections.old pending.old opds-enabled.old '' ~ ~ %.n %.y ~ ~ 'annas-archive.gl'])]
  ::
      %2
    [cleanup this(state [%10 books.old positions.old book-order.old collections.old pending.old %.n '' ~ ~ %.n %.y ~ ~ 'annas-archive.gl'])]
  ::
      %1
    [cleanup this(state [%10 books.old positions.old book-order.old collections.old ~ %.n '' ~ ~ %.n %.y ~ ~ 'annas-archive.gl'])]
  ::
      %0
    =/  new-colls=(map @t collection:boox)
      %-  ~(run by collections.old)
      |=(bids=(set book-id:boox) `collection:boox`[bids '' %.n %.n ~])
    [cleanup this(state [%10 books.old positions.old book-order.old new-colls ~ %.n '' ~ ~ %.n %.y ~ ~ 'annas-archive.gl'])]
  ==
::
++  on-init
  ^-  (quip card _this)
  :_  this
  :~  ::  claim then release stale /apps/boox binding so docket can serve
      [%pass /eyre/takeover %arvo %e %connect [~ /apps/boox] dap.bowl]
      [%pass /eyre/takeover %arvo %e %disconnect [~ /apps/boox]]
      ::  bind our API endpoint
      :*  %pass  /eyre/connect
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
        %toggle-opds
      =.  opds-enabled  !opds-enabled
      `this
    ::
        %set-opds-password
      =.  opds-password  password.act
      `this
    ::
        %toggle-last-scrobble
      =.  last-scrobble  !last-scrobble
      `this
    ::
        %toggle-last-scrobble-upload
      =.  last-scrobble-upload  !last-scrobble-upload
      `this
    ::
        %set-annas-domain
      =.  annas-domain  domain.act
      `this
    ::
        %set-book-hash
      ?>  =(src.bowl our.bowl)
      =.  book-hashes  (~(put by book-hashes) book-id.act hash.act)
      ?.  =('' hash.act)  :: fire iris check if hash is non-empty
        =/  dom=@t  ?:(=('' annas-domain) 'annas-archive.gl' annas-domain)
        =/  url=@t  (crip "https://{(trip dom)}/md5/{(trip hash.act)}")
        =/  req=request:http  [%'GET' url ~ ~]
        :_  this
        ^-  (list card)
        :~  [%pass /annas/(scot %uv book-id.act) %arvo %i %request req *outbound-config:iris]
        ==
      `this
    ::
        %scrobble-to-last
      =/  bid  book-id.act
      =/  bk=(unit book:boox)  (~(get by books) bid)
      ?~  bk  `this
      =/  bh=@t  (~(gut by book-hashes) bid '')
      =/  jon=json
        %-  pairs:enjs:format
        :~  ['action' s+'scrobble']
            ['verb' s+'reading']
            ['name' s+title.u.bk]
            ['image' s+cover-url.u.bk]
            ['source' s+'boox']
            :-  'meta'
            %-  pairs:enjs:format
            %+  weld
              :~  ['book-id' s+(scot %uv bid)]
                  ['author' s+author.u.bk]
                  ['s3-url' s+s3-url.u.bk]
              ==
            ^-  (list [@t json])
            ?:(=('' bh) ~ ~[['content-hash' s+bh]])
        ==
      :_  this
      :~  [%pass /last/scrobble %agent [our.bowl %last] %poke %json !>(jon)]
      ==
    ::
        %add-book
      =/  bid  book-id.act
      =/  bk   book.act
      =.  date-added.bk  now.bowl
      =.  books  (~(put by books) bid bk)
      =.  book-order  (snoc book-order bid)
      =/  upload-cards=(list card)
        ?.  last-scrobble-upload  ~
        =/  bh=@t  (~(gut by book-hashes) bid '')
        =/  jon=json
          %-  pairs:enjs:format
          :~  ['action' s+'scrobble']
              ['verb' s+'reading']
              ['name' s+title.bk]
              ['image' s+cover-url.bk]
              ['source' s+'boox']
              :-  'meta'
              %-  pairs:enjs:format
              %+  weld
                :~  ['book-id' s+(scot %uv bid)]
                    ['author' s+author.bk]
                    ['s3-url' s+s3-url.bk]
                ==
              ^-  (list [@t json])
              ?:(=('' bh) ~ ~[['content-hash' s+bh]])
          ==
        :~  [%pass /last/scrobble %agent [our.bowl %last] %poke %json !>(jon)]
        ==
      :_  this
      %+  weld  upload-cards
      ^-  (list card)
      :~  [%give %fact ~[/updates] boox-update+!>([%book-added bid bk])]
      ==
    ::
        %remove-book
      =/  bid  book-id.act
      =.  books      (~(del by books) bid)
      =.  positions  (~(del by positions) bid)
      =.  notations  (~(del by notations) bid)
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
      =/  first-open=?  !(~(has by positions) bid)
      =/  pos=position:boox
        position.act(updated-at now.bowl)
      =.  positions  (~(put by positions) bid pos)
      =/  scrobble-cards=(list card)
        ?.  &(first-open last-scrobble)  ~
        =/  bk=(unit book:boox)  (~(get by books) bid)
        ?~  bk  ~
        =/  bh=@t  (~(gut by book-hashes) bid '')
        =/  jon=json
          %-  pairs:enjs:format
          :~  ['action' s+'scrobble']
              ['verb' s+'reading']
              ['name' s+title.u.bk]
              ['image' s+cover-url.u.bk]
              ['source' s+'boox']
              :-  'meta'
              %-  pairs:enjs:format
              %+  weld
                :~  ['book-id' s+(scot %uv bid)]
                    ['author' s+author.u.bk]
                    ['s3-url' s+s3-url.u.bk]
                ==
              ^-  (list [@t json])
              ?:(=('' bh) ~ ~[['content-hash' s+bh]])
          ==
        :~  [%pass /last/scrobble %agent [our.bowl %last] %poke %json !>(jon)]
        ==
      :_  this
      %+  weld  scrobble-cards
      ^-  (list card)
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
        %toggle-readable
      =.  readable-colls
        ?:  (~(has in readable-colls) name.act)
          (~(del in readable-colls) name.act)
        (~(put in readable-colls) name.act)
      `this
    ::
        %add-notation
      =/  book-notes=(map @uv notation:boox)
        (~(gut by notations) book-id.act *(map @uv notation:boox))
      =.  notations
        (~(put by notations) book-id.act (~(put by book-notes) nid.act notation.act(created-at now.bowl)))
      `this
    ::
        %remove-notation
      =/  book-notes=(map @uv notation:boox)
        (~(gut by notations) book-id.act *(map @uv notation:boox))
      =.  notations
        (~(put by notations) book-id.act (~(del by book-notes) nid.act))
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
  ++  check-basic-auth
    |=  headers=(list [key=@t value=@t])
    ^-  ?
    =/  auth-header=(unit @t)
      =/  hdrs=(list [key=@t value=@t])  headers
      |-
      ?~  hdrs  ~
      ?:  =("authorization" (cass (trip key.i.hdrs)))
        `value.i.hdrs
      $(hdrs t.hdrs)
    ?~  auth-header  %.n
    =/  val=tape  (trip u.auth-header)
    ?.  =("Basic " (scag 6 val))  %.n
    =/  encoded=tape  (slag 6 val)
    =/  decoded=(unit octs)  (de:base64:mimes:html (crip encoded))
    ?~  decoded  %.n
    =/  cred=tape  (trip q.u.decoded)
    =/  colon=(unit @ud)  (find ":" cred)
    ?~  colon  %.n
    =/  pass=tape  (slag +(u.colon) cred)
    ?:  !=('' opds-password)
      =(pass (trip opds-password))
    =/  code=@p
      .^(@p %j /(scot %p our.bowl)/code/(scot %da now.bowl)/(scot %p our.bowl))
    =/  code-text=tape  (trip (scot %p code))
    =(pass ?:(=("~" (scag 1 code-text)) (slag 1 code-text) code-text))
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
    =/  hark-cards=(list card)
      =/  res=(each (list card) tang)
        %-  mule  |.
        =/  yarn-id  (end 7 (shas %boox-book-received eny.bowl))
        =/  msg=@t  (crip "{(trip (scot %p from))} sent you: {(trip title.bk)}")
        =/  con  ~[[%text msg]]
        =/  rop  [[~ our.bowl %boox] [~ %boox our.bowl %boox] %boox /]
        =/  wer=path  /apps/boox
        :~  [%pass /hark %agent [our.bowl %hark] %poke %hark-action !>([%add-yarn & & yarn-id rop now.bowl con wer ~])]
        ==
      ?:(?=(%& -.res) p.res ~)
    :_  this
    hark-cards
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
            =/  notes=(map @uv notation:boox)
              (~(gut by notations) bid *(map @uv notation:boox))
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
                ['content-hash' s+(~(gut by book-hashes) bid '')]
                ['annas-found' b+(~(gut by annas-found) bid %.n)]
                ['tags' [%a (turn ~(tap in tags.u.bk) |=(t=@t s+t))]]
                :-  'notations'
                :-  %a
                %+  turn  ~(tap by notes)
                |=  [nid=@uv n=notation:boox]
                %-  pairs:enjs:format
                :~  ['anchor' s+anchor.n]
                    ['selected' s+selected.n]
                    ['note' s+note.n]
                ==
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
    ::  redirect non-API requests to /apps/boox/ for docket
    ::
    ?.  ?=([%apps %boox %api *] site)
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      :_  ~
      :-  301
      :~  ['location' '/apps/boox/']
          ['cache-control' 'no-cache']
      ==
    =/  site=(list @t)  t.t.t.site
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
    ::  OPDS endpoints: basic auth, no cookie required
    ::
    ?:  ?=([%opds *] site)
      ?.  opds-enabled
        :_  this
        %+  give-simple-payload:app:server  eyre-id
        [[404 ~] `(as-octs:mimes:html 'OPDS not enabled')]
      ?.  ?=(%'GET' method.request.req)
        :_  this
        %+  give-simple-payload:app:server  eyre-id
        [[405 ~] ~]
      ::  check cookie auth OR basic auth
      ?.  ?|  authenticated.req
              (check-basic-auth header-list.request.req)
          ==
        :_  this
        %+  give-simple-payload:app:server  eyre-id
        :_  ~
        :-  401
        :~  ['www-authenticate' 'Basic realm="Boox OPDS"']
        ==
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      (handle-scry site)
    ::  PWA assets: no auth, served with correct MIME types
    ::  (docket glob serves as application/octet-stream which browsers reject)
    ::
    ?:  ?&  ?=([@ ~] site)
            =(i.site 'manifest.json')
        ==
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      :_  :-  ~
          %-  as-octs:mimes:html
          '{"name":"Boox","short_name":"Boox","start_url":"/apps/boox/","scope":"/apps/boox/","display":"standalone","background_color":"#0f0f1a","theme_color":"#8b9cf7","icons":[{"src":"/apps/boox/icon.svg","sizes":"any","type":"image/svg+xml"}]}'
      :-  200
      :~  ['content-type' 'application/manifest+json']
      ==
    ?:  ?&  ?=([@ ~] site)
            =(i.site 'sw.js')
        ==
      :_  this
      %+  give-simple-payload:app:server  eyre-id
      :_  :-  ~
          %-  as-octs:mimes:html
          'self.addEventListener("install",e=>{e.waitUntil(self.skipWaiting())});self.addEventListener("activate",e=>{e.waitUntil(self.clients.claim())});self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.pathname.startsWith("/apps/boox/api")||u.origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open("boox-v2").then(ca=>ca.put(e.request,c))}return r}).catch(()=>caches.match(e.request)))});'
      :-  200
      :~  ['content-type' 'application/javascript']
          ['service-worker-allowed' '/apps/boox/']
      ==
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
      =/  readable=?  (~(has in readable-colls) coll-name)
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
          ['readable' b+readable]
          :-  'books'
          :-  %a
          %+  turn  coll-books
          |=  [bid=book-id:boox bk=book:boox]
          =/  notes=(map @uv notation:boox)
            (~(gut by notations) bid *(map @uv notation:boox))
          %-  pairs:enjs:format
          :~  ['id' s+(scot %uv bid)]
              ['title' s+title.bk]
              ['author' s+author.bk]
              ['format' s+(format-to-cord format.bk)]
              ?:  readable
                ['s3-url' s+s3-url.bk]
              ['s3-url' s+'']
              ['cover-url' s+cover-url.bk]
              ['file-size' (numb:enjs:format file-size.bk)]
              ['date-added' (sect:enjs:format date-added.bk)]
              ['description' s+description.bk]
              ['content-hash' s+(~(gut by book-hashes) bid '')]
              ['annas-found' b+(~(gut by annas-found) bid %.n)]
              ['tags' [%a (turn ~(tap in tags.bk) |=(t=@t s+t))]]
              :-  'notations'
              :-  %a
              %+  turn  ~(tap by notes)
              |=  [nid=@uv n=notation:boox]
              %-  pairs:enjs:format
              :~  ['id' s+(scot %uv nid)]
                  ['anchor' s+anchor.n]
                  ['selected' s+selected.n]
                  ['note' s+note.n]
              ==
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
          "<script src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'></script>"
          "<script src='https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js'></script>"
          "<script src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'></script>"
          "<style>"
          "*,*::before,*::after\{box-sizing:border-box;margin:0;padding:0}"
          "body\{font-family:'Hanken Grotesk',-apple-system,system-ui,sans-serif;"
          "background:#0F0F0F;color:#E8E8E6;min-height:100vh;padding:2rem 1.5rem;"
          "-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.5}"
          ".w\{max-width:900px;margin:0 auto;overflow:hidden}"
          ".sh\{color:#5A5A58;font-size:.8rem;font-family:monospace;margin-bottom:.25rem}"
          "h1\{font-size:1.5rem;font-weight:600;margin-bottom:.25rem;letter-spacing:-.02em}"
          ".dc\{color:#8A8A87;margin-bottom:2rem;font-size:.9rem}"
          ".g\{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,200px));gap:1.25rem}"
          ".c\{cursor:pointer;transition:transform 150ms ease}.c:hover\{transform:translateY(-2px)}"
          ".cv\{aspect-ratio:2/3;background:#1E1E1C;border-radius:8px;overflow:hidden;"
          "position:relative;border:1px solid #2A2A28;margin-bottom:.5rem}"
          ".cv img\{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}"
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
          "#reader-overlay\{position:fixed;top:0;left:0;right:0;bottom:0;background:#0F0F0F;"
          "z-index:1000;display:none;flex-direction:column}"
          "#reader-overlay.open\{display:flex}"
          ".rbar\{display:flex;align-items:center;padding:.75rem 1rem;gap:.5rem;"
          "border-bottom:1px solid #2A2A28;flex-shrink:0}"
          ".rbar button\{background:none;border:none;color:#E8E8E6;font-size:1.25rem;cursor:pointer;"
          "padding:.25rem .4rem;flex-shrink:0}"
          ".rbar .rtitle\{font-size:.85rem;color:#8A8A87;display:flex;align-items:center;gap:.4rem;"
          "flex:1;min-width:0;overflow:hidden}"
          ".rbar .rtitle span\{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
          ".rbar .rtitle a\{color:#8A8A87;font-size:.7rem;text-decoration:none;flex-shrink:0}"
          ".rbar .rtitle a:hover\{color:#E8E8E6}"
          "#reader-content\{flex:1;overflow:auto}"
          ".pdf-pg\{display:flex;justify-content:center;padding:1rem}"
          ".pdf-pg canvas\{max-width:100%;height:auto}"
          ".boox-highlight\{background:rgba(251,191,36,.3);cursor:pointer;border-radius:2px}"
          "@media(max-width:768px)\{body\{padding:1rem .75rem}"
          ".g\{grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:.75rem}"
          ".rbar\{padding:.5rem .25rem;gap:.2rem}"
          ".rbar button\{font-size:.9rem;padding:.15rem .2rem;min-width:0}"
          ".rbar .rtitle\{font-size:.7rem}"
          ".rbar .rtitle a\{font-size:.6rem}}"
          "</style></head><body><div class=w id=app>"
          "<div class=ld>Loading collection...</div></div>"
          "<div id=reader-overlay><div class=rbar>"
          "<button onclick=\"closeReader()\">&larr;</button>"
          "<button id=reader-prev onclick=\"readerPrev()\" style=\"display:none\">&lsaquo;</button>"
          "<span class=rtitle><span id=reader-title></span>"
          "<a id=reader-dl href='' download style='display:none'>&#8681;</a></span>"
          "<button id=zoom-dec onclick=\"zoomDec()\" style=\"display:none;font-size:.7rem\">&minus;</button>"
          "<button id=zoom-inc onclick=\"zoomInc()\" style=\"display:none;font-size:.7rem\">+</button>"
          "<button id=reader-next onclick=\"readerNext()\" style=\"display:none\">&rsaquo;</button>"
          "</div>"
          "<div id=reader-content></div></div>"
          "<script>"
          "pdfjsLib.GlobalWorkerOptions.workerSrc="
          "'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';"
          "var BKS=[],REND=null,CUR_IDX=-1,CUR_FMT='',FSIZE=parseInt(localStorage.getItem('boox-pub-font'))||100,"
          "PZOOM=parseFloat(localStorage.getItem('boox-pub-zoom'))||1;"
          "fetch('"
          api-path
          "').then(function(r)\{if(!r.ok)throw new Error('Not found');return r.json()})"
          ".then(function(d)\{"
          "BKS=d.books;var a=document.getElementById('app'),h='';"
          "h+='<div class=sh>'+e(d.ship)+'</div>';"
          "h+='<h1>'+e(d.name)+'</h1>';"
          "if(d.description)h+='<p class=dc>'+e(d.description)+'</p>';"
          "if(!d.readable)h+='<div class=ht>This collection has <strong>'+d.books.length+'</strong> book'+"
          "(d.books.length!==1?'s':'')+'. A showcase of the owner&#39;s library.</div>';"
          "else h+='<div class=ht>This collection has <strong>'+d.books.length+'</strong> book'+"
          "(d.books.length!==1?'s':'')+'. Click a book to read it.</div>';"
          "h+='<div class=g>';"
          "d.books.forEach(function(b,i)\{"
          "var oc=d.readable?'onclick=\"openBook('+i+')\"':'';"
          "h+='<div class=c '+oc+'><div class=cv>';"
          "if(b['cover-url'])h+='<img src=\"'+e(fixUrl(b['cover-url']))+'\" loading=lazy>';"
          "else h+='<div class=ph>'+e(b.title).slice(0,40)+'</div>';"
          "h+='<span class=bg>'+e(b.format)+'</span></div>';"
          "h+='<div class=m><div class=t>'+e(b.title)+'</div>';"
          "h+='<div class=a>'+e(b.author||'Unknown')+'</div></div></div>';"
          "});"
          "h+='</div><div class=pw>Shared via <a href=https://urbit.org>Urbit</a> / Boox</div>';"
          "a.innerHTML=h;"
          "var hp=new URLSearchParams(location.hash.slice(1));"
          "if(hp.get('read')!=null&&d.readable)openBook(parseInt(hp.get('read')),hp.get('pos'))})"
          ".catch(function(x)\{document.getElementById('app').innerHTML='<div class=er>'+e(x.message)+'</div>'});"
          "function e(s)\{if(!s)return '';var d=document.createElement('div');d.textContent=s;return d.innerHTML}"
          "function fixUrl(u)\{return u&&!/^https?:\\/\\//.test(u)?'https://'+u:u}"
          "document.addEventListener('keydown',function(ev)\{"
          "if(!REND)return;"
          "if(ev.key==='ArrowRight'||ev.key===' ')\{ev.preventDefault();REND.next()}"
          "if(ev.key==='ArrowLeft')\{ev.preventDefault();REND.prev()}"
          "if(ev.key==='Escape')closeReader()});"
          "var _tx=0,_ty=0;document.getElementById('reader-content').addEventListener('touchstart',function(ev)\{"
          "_tx=ev.changedTouches[0].clientX;_ty=ev.changedTouches[0].clientY},\{passive:true});"
          "document.getElementById('reader-content').addEventListener('touchend',function(ev)\{"
          "if(!REND)return;var dx=ev.changedTouches[0].clientX-_tx,dy=ev.changedTouches[0].clientY-_ty;"
          "if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)\{if(dx<0)REND.next();else REND.prev()}"
          "},\{passive:true});"
          "function applyEpubFont()\{"
          "try\{var fr=document.querySelector('#reader-content iframe');"
          "if(fr&&fr.contentDocument)fr.contentDocument.body.style.setProperty('font-size',FSIZE+'%','important')"
          "}catch(x)\{}}"
          "function applyPdfZoom()\{document.querySelectorAll('.pdf-pg canvas').forEach(function(cv)\{"
          "cv.style.maxWidth='none';cv.style.width=(PZOOM*100)+'%'})};"
          "function openBook(i,pos)\{"
          "var b=BKS[i],u=fixUrl(b['s3-url']),f=b.format,ov=document.getElementById('reader-overlay'),"
          "rc=document.getElementById('reader-content');CUR_IDX=i;CUR_FMT=f;"
          "document.getElementById('reader-title').textContent=b.title;"
          "var dl=document.getElementById('reader-dl');"
          "dl.href=u;dl.download=b.title||'';dl.style.display=u?'':'none';"
          "rc.innerHTML='<div class=ld>Loading...</div>';"
          "ov.classList.add('open');location.hash='read='+i;"
          "document.getElementById('zoom-dec').style.display='';"
          "document.getElementById('zoom-inc').style.display='';"
          "if(f==='epub')\{var book=ePub(u);"
          "rc.innerHTML='';REND=book.renderTo(rc,\{width:'100%',height:'100%',spread:'none',allowScriptedContent:true});"
          "REND.themes.default(\{body:\{color:'#E8E8E6 !important','background-color':'#0F0F0F !important'},"
          "'p,div,span,li,td,th,h1,h2,h3,h4,h5,h6':\{color:'#E8E8E6 !important'},"
          "'a':\{color:'#8A8A87 !important'},'.boox-highlight':\{background:'rgba(251,191,36,.3)',cursor:'pointer','border-radius':'2px'}});"
          "REND.hooks.content.register(function()\{setTimeout(applyEpubFont,50)});"
          "REND.on('keyup',function(ev)\{"
          "if(ev.key==='ArrowRight'||ev.key===' ')REND.next();"
          "if(ev.key==='ArrowLeft')REND.prev()});"
          "REND.on('relocated',function(loc)\{"
          "if(loc&&loc.start)location.hash='read='+CUR_IDX+'&pos='+encodeURIComponent(loc.start.cfi)});"
          "REND.on('started',function()\{"
          "if(b.notations)(b.notations).forEach(function(n)\{"
          "try\{REND.annotations.highlight(n.anchor,\{},"
          "function()\{var p=document.createElement('div');"
          "p.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1001;"
          "background:#1A1A18;border:1px solid #2A2A28;border-radius:8px;padding:12px;width:280px;box-shadow:0 8px 24px rgba(0,0,0,.3)';"
          "p.innerHTML='<div style=\"font-style:italic;color:#8A8A87;font-size:.8rem;border-left:2px solid #3A3A38;padding-left:8px;margin-bottom:8px\">\"'+e(n.selected).slice(0,200)+'\"</div>'"
          "+(n.note?'<div style=\"font-size:.85rem;margin-bottom:8px\">'+e(n.note)+'</div>':'')+"
          "'<button onclick=\"this.parentElement.remove()\" style=\"background:none;border:1px solid #2A2A28;color:#E8E8E6;padding:4px 12px;border-radius:4px;cursor:pointer\">Close</button>';"
          "document.body.appendChild(p)},"
          "'boox-highlight')}catch(ex)\{}})});"
          "if(pos)REND.display(decodeURIComponent(pos));else REND.display();"
          "document.getElementById('reader-prev').style.display='';"
          "document.getElementById('reader-next').style.display=''}"
          "else if(f==='pdf')\{"
          "pdfjsLib.getDocument(u).promise.then(function(pdf)\{"
          "rc.innerHTML='';for(var p=1;p<=pdf.numPages;p++)(function(pn)\{"
          "pdf.getPage(pn).then(function(pg)\{"
          "var sc=Math.min((window.innerWidth-32)/pg.getViewport(\{scale:1}).width,2);"
          "var vp=pg.getViewport(\{scale:sc}),cv=document.createElement('canvas');"
          "cv.width=vp.width;cv.height=vp.height;"
          "var dv=document.createElement('div');dv.className='pdf-pg';dv.appendChild(cv);"
          "rc.appendChild(dv);pg.render(\{canvasContext:cv.getContext('2d'),viewport:vp})."
          "then(function()\{if(PZOOM!==1)applyPdfZoom()})"
          "})})(p)})}"
          "else\{window.open(u,'_blank');ov.classList.remove('open')}}"
          "function readerPrev()\{if(REND)REND.prev()}"
          "function readerNext()\{if(REND)REND.next()}"
          "function closeReader()\{if(REND)\{REND.destroy();REND=null}"
          "CUR_FMT='';CUR_IDX=-1;PZOOM=1;history.replaceState(null,'',location.pathname);"
          "document.getElementById('reader-overlay').classList.remove('open');"
          "document.getElementById('reader-content').innerHTML='';"
          "document.getElementById('reader-prev').style.display='none';"
          "document.getElementById('reader-next').style.display='none';"
          "document.getElementById('zoom-dec').style.display='none';"
          "document.getElementById('zoom-inc').style.display='none'}"
          "function zoomInc()\{if(CUR_FMT==='epub')\{FSIZE=Math.min(FSIZE+10,200);"
          "applyEpubFont();localStorage.setItem('boox-pub-font',FSIZE)}"
          "else if(CUR_FMT==='pdf')\{PZOOM=Math.min(PZOOM*1.25,4);"
          "applyPdfZoom();localStorage.setItem('boox-pub-zoom',PZOOM)}}"
          "function zoomDec()\{if(CUR_FMT==='epub')\{FSIZE=Math.max(FSIZE-10,60);"
          "applyEpubFont();localStorage.setItem('boox-pub-font',FSIZE)}"
          "else if(CUR_FMT==='pdf')\{PZOOM=Math.max(PZOOM*0.8,0.5);"
          "applyPdfZoom();localStorage.setItem('boox-pub-zoom',PZOOM)}}"
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
          =/  note-count=@ud
            ~(wyt by (~(gut by notations) bid *(map @uv notation:boox)))
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
              ['content-hash' s+(~(gut by book-hashes) bid '')]
              ['annas-found' b+(~(gut by annas-found) bid %.n)]
              :-  'tags'
              [%a (turn ~(tap in tags.bk) |=(t=@t s+t))]
              :-  'position'
              ?~  pos  ~
              %-  pairs:enjs:format
              :~  ['value' s+value.u.pos]
                  ['progress' (numb:enjs:format progress.u.pos)]
                  ['updated-at' (sect:enjs:format updated-at.u.pos)]
              ==
              ['notation-count' (numb:enjs:format note-count)]
          ==
      ==
    ::
        [%book @ ~]
      =/  bid=(unit book-id:boox)  (slaw %uv i.t.site)
      ?~  bid  not-found:gen:server
      =/  bk=(unit book:boox)  (~(get by books) u.bid)
      ?~  bk  not-found:gen:server
      =/  pos=(unit position:boox)  (~(get by positions) u.bid)
      =/  notes=(map @uv notation:boox)
        (~(gut by notations) u.bid *(map @uv notation:boox))
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
          ['content-hash' s+(~(gut by book-hashes) u.bid '')]
          ['annas-found' b+(~(gut by annas-found) u.bid %.n)]
          :-  'tags'
          [%a (turn ~(tap in tags.u.bk) |=(t=@t s+t))]
          :-  'position'
          ?~  pos  ~
          %-  pairs:enjs:format
          :~  ['value' s+value.u.pos]
              ['progress' (numb:enjs:format progress.u.pos)]
              ['updated-at' (sect:enjs:format updated-at.u.pos)]
          ==
          :-  'notations'
          :-  %a
          %+  turn  ~(tap by notes)
          |=  [nid=@uv n=notation:boox]
          %-  pairs:enjs:format
          :~  ['id' s+(scot %uv nid)]
              ['anchor' s+anchor.n]
              ['selected' s+selected.n]
              ['note' s+note.n]
              ['created-at' (sect:enjs:format created-at.n)]
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
              ['readable' b+(~(has in readable-colls) name)]
              :-  'share-token'
              ?~  share-token.c  ~
              s+(scot %uv u.share-token.c)
          ==
      ==
    ::
        [%pals ~]
      =/  pals=(set @p)
        =/  res=(unit (set @p))
          %-  mole
          |.(.^((set @p) %gx /(scot %p our.bowl)/pals/(scot %da now.bowl)/mutuals/noun))
        ?~  res  ~
        u.res
      =/  contacts=(set @p)
        =/  res=(unit (map * *))
          %-  mole
          |.(.^((map * *) %gx /(scot %p our.bowl)/contacts/(scot %da now.bowl)/v1/book/noun))
        ?~  res  ~
        %-  silt
        %+  murn  ~(tap in ~(key by u.res))
        |=(k=* ?@(k (some `@p`k) ~))
      ::  combine, deduplicate, filter to planets+
      =/  ships=(list @p)
        %+  skim  ~(tap in (~(uni in pals) contacts))
        |=(s=@p (lth `@`s (bex 32)))
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
    ::
        [%settings ~]
      %-  json-response:gen:server
      %-  pairs:enjs:format
      :~  ['opds-enabled' b+opds-enabled]
          ['opds-password' s+opds-password]
          ['last-scrobble' b+last-scrobble]
          ['last-scrobble-upload' b+last-scrobble-upload]
          ['annas-domain' s+?:(=('' annas-domain) 'annas-archive.gl' annas-domain)]
      ==
    ::
    ::  OPDS catalog feeds
    ::
        [%opds ~]
      =/  ship=tape  (trip (scot %p our.bowl))
      (opds-root ship "/apps/boox/api" collections)
    ::
        [%opds %all ~]
      =/  ship=tape  (trip (scot %p our.bowl))
      (opds-all-books ship "/apps/boox/api" book-order books)
    ::
        [%opds %collection @ ~]
      =/  ship=tape  (trip (scot %p our.bowl))
      =/  coll=(unit collection:boox)  (~(get by collections) i.t.t.site)
      ?~  coll  not-found:gen:server
      (opds-collection-feed i.t.t.site ship "/apps/boox/api" u.coll books)
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
            %'toggle-readable'
          [%toggle-readable ((ot ~[name+so]) jon)]
        ::
            %'add-notation'
          =/  f  (ot ~[book-id+(se %uv) nid+(se %uv) anchor+so selected+so note+so])
          =/  [bid=@uv nid=@uv anchor=@t selected=@t note=@t]  (f jon)
          [%add-notation bid nid [anchor selected note *@da]]
        ::
            %'remove-notation'
          =/  f  (ot ~[book-id+(se %uv) nid+(se %uv)])
          =/  [bid=@uv nid=@uv]  (f jon)
          [%remove-notation bid nid]
        ::
            %'toggle-opds'
          [%toggle-opds ~]
        ::
            %'set-opds-password'
          [%set-opds-password ((ot ~[password+so]) jon)]
        ::
            %'toggle-last-scrobble'
          [%toggle-last-scrobble ~]
        ::
            %'toggle-last-scrobble-upload'
          [%toggle-last-scrobble-upload ~]
        ::
            %'set-annas-domain'
          [%set-annas-domain ((ot ~[domain+so]) jon)]
        ::
            %'set-book-hash'
          =/  f  (ot ~[book-id+(se %uv) hash+so])
          =/  [bid=@uv hash=@t]  (f jon)
          [%set-book-hash bid hash]
        ::
            %'scrobble-to-last'
          [%scrobble-to-last ((ot ~[book-id+(se %uv)]) jon)]
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
  ::
      [%last *]
    ?+  -.sign  `this
        %poke-ack
      ?~  p.sign  `this
      ~&  [%boox-last-scrobble-failed u.p.sign]
      `this
    ==
  ::
      [%hark ~]
    ?+  -.sign  `this
        %poke-ack  `this
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
              ['content-hash' s+(~(gut by book-hashes) bid '')]
              ['annas-found' b+(~(gut by annas-found) bid %.n)]
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
      [%eyre *]
    ?:  ?=(%bound +<.sign)
      ~?  !accepted.sign  [dap.bowl %binding-rejected binding.sign]
      [~ this]
    [~ this]
  ::
      [%annas @ ~]
    =/  bid=book-id:boox  (slav %uv i.t.wire)
    ?.  ?=([%iris %http-response *] sign)  `this
    =/  resp=client-response:iris  client-response.sign
    ?.  ?=(%finished -.resp)  `this
    =/  code=@ud  status-code.response-header.resp
    =.  annas-found  (~(put by annas-found) bid =(200 code))
    `this
  ::
      [%backfill @ ~]
    =/  bid=book-id:boox  (slav %uv i.t.wire)
    ?.  ?=([%iris %http-response *] sign)  `this
    =/  resp=client-response:iris  client-response.sign
    ?.  ?=(%finished -.resp)  `this
    =/  hdrs=(list [key=@t value=@t])
      headers.response-header.resp
    =/  etag=(unit @t)
      |-
      ?~  hdrs  ~
      ?:  =('etag' (crip (cass (trip key.i.hdrs))))
        `(crip (skip (trip value.i.hdrs) |=(c=@t =(c '"'))))
      $(hdrs t.hdrs)
    ?~  etag  `this
    =.  book-hashes  (~(put by book-hashes) bid u.etag)
    ::  also check anna's for this hash
    =/  dom=@t  ?:(=('' annas-domain) 'annas-archive.gl' annas-domain)
    =/  url=@t  (crip "https://{(trip dom)}/md5/{(trip u.etag)}")
    =/  req=request:http  [%'GET' url ~ ~]
    :_  this
    ^-  (list card)
    :~  [%pass /annas/(scot %uv bid) %arvo %i %request req *outbound-config:iris]
    ==
  ==
--
