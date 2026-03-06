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
::  reading position - varies by format
::  for epub: cfi string; for pdf: page number; for text: scroll percentage
::
+$  position
  $:  value=@t
      progress=@ud
      updated-at=@da
  ==
::
::  agent state
::
+$  state-0
  $:  %0
      books=(map book-id book)
      positions=(map book-id position)
      book-order=(list book-id)
      collections=(map @t (set book-id))
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
