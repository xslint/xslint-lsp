<?xml version="1.0"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:tools="urn:tools" version="2.0">
  <xsl:include href="tools.xsl"/>
  <xsl:template match="shelf">
    <xsl:if test="count(book) = 0">
      <xsl:value-of select="tools:title(.)"/>
    </xsl:if>
  </xsl:template>
</xsl:stylesheet>
