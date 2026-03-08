|%
::  identifiers
::
+$  book-id  @uv
::
::  supported book formats
::
+$  format
  $?  %pdf
      %epub
      %mobi
      %txt
      %md
      %html
  ==
::
::  book metadata
::
+$  book
  $:  title=@t
      author=@t
      =format
      s3-url=@t
      cover-url=@t
      file-size=@ud
      date-added=@da
      tags=(set @t)
      description=@t
  ==
::
::  reading position
::
+$  position
  $:  value=@t
      progress=@ud
      updated-at=@da
  ==
::
::  shared collection with ACL
::
+$  collection
  $:  books=(set book-id)
      description=@t
      shared=?
      public=?
      share-token=(unit @uv)
  ==
::
::  pending book from a friend
::
+$  pending-book
  $:  from=@p
      =book
      received-at=@da
  ==
::
::  annotation/highlight on a book passage
::
+$  notation
  $:  anchor=@t
      selected=@t
      note=@t
      created-at=@da
  ==
::
::  agent states
::
+$  state-0
  $:  %0
      books=(map book-id book)
      positions=(map book-id position)
      book-order=(list book-id)
      collections=(map @t (set book-id))
  ==
::
+$  state-1
  $:  %1
      books=(map book-id book)
      positions=(map book-id position)
      book-order=(list book-id)
      collections=(map @t collection)
  ==
::
+$  state-2
  $:  %2
      books=(map book-id book)
      positions=(map book-id position)
      book-order=(list book-id)
      collections=(map @t collection)
      pending=(map @uv pending-book)
  ==
::
+$  state-3
  $:  %3
      books=(map book-id book)
      positions=(map book-id position)
      book-order=(list book-id)
      collections=(map @t collection)
      pending=(map @uv pending-book)
      opds-enabled=?
  ==
::
+$  state-4
  $:  %4
      books=(map book-id book)
      positions=(map book-id position)
      book-order=(list book-id)
      collections=(map @t collection)
      pending=(map @uv pending-book)
      opds-enabled=?
      opds-password=@t
  ==
::
+$  state-5
  $:  %5
      books=(map book-id book)
      positions=(map book-id position)
      book-order=(list book-id)
      collections=(map @t collection)
      pending=(map @uv pending-book)
      opds-enabled=?
      opds-password=@t
      readable-colls=(set @t)
  ==
::
+$  state-6
  $:  %6
      books=(map book-id book)
      positions=(map book-id position)
      book-order=(list book-id)
      collections=(map @t collection)
      pending=(map @uv pending-book)
      opds-enabled=?
      opds-password=@t
      readable-colls=(set @t)
      notations=(map book-id (map @uv notation))
  ==
::
+$  versioned-state
  $%  state-0
      state-1
      state-2
      state-3
      state-4
      state-5
      state-6
  ==
::
::  poke actions
::
+$  action
  $%  [%add-book =book-id =book]
      [%remove-book =book-id]
      [%update-metadata =book-id title=@t author=@t description=@t cover-url=@t]
      [%set-position =book-id =position]
      [%add-tag =book-id tag=@t]
      [%remove-tag =book-id tag=@t]
      [%reorder-books order=(list book-id)]
      [%add-to-collection name=@t =book-id]
      [%remove-from-collection name=@t =book-id]
      [%delete-collection name=@t]
      [%create-collection name=@t description=@t]
      [%share-collection name=@t]
      [%unshare-collection name=@t]
      [%publish-collection name=@t]
      [%unpublish-collection name=@t]
      [%toggle-readable name=@t]
      ::  notations
      [%add-notation =book-id nid=@uv =notation]
      [%remove-notation =book-id nid=@uv]
      ::  settings
      [%toggle-opds ~]
      [%set-opds-password password=@t]
      ::  social: owner-initiated
      [%browse-ship ship=@p]
      [%send-book =book-id to=@p]
      [%dismiss-pending pid=@uv]
      ::  social: remote-initiated (any ship)
      [%request-shared ~]
      [%shared-data from=@p data=@t]
      [%receive-book from=@p =book]
  ==
::
::  subscription updates
::
+$  update
  $%  [%book-added =book-id =book]
      [%book-removed =book-id]
      [%metadata-updated =book-id =book]
      [%position-updated =book-id =position]
      [%books-reordered order=(list book-id)]
  ==
--
