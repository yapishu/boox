/-  boox
|_  act=action:boox
++  grow
  |%
  ++  noun  act
  --
++  grab
  |%
  ++  noun  action:boox
  ++  json
    |=  jon=json
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
++  grad  %noun
--
