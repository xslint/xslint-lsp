<?xml version="1.0"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:tools="urn:tools" version="2.0">
  <xsl:function name="tools:title">
    <xsl:param name="a"/>
    <xsl:value-of select="$a/child::title"/>
  </xsl:function>
</xsl:stylesheet>
