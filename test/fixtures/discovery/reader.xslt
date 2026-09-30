<?xml version="1.0"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:shelf="urn:shelf" version="2.0">
  <xsl:template match="reader">
    <xsl:value-of select="shelf:greeting()"/>
  </xsl:template>
</xsl:stylesheet>
